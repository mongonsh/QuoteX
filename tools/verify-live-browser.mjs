import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const DEFAULT_FRONTEND_URL = "https://mongonsh.github.io/QuoteX/";
const DEFAULT_CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const frontendUrl = process.env.QUOTEX_FRONTEND_URL || DEFAULT_FRONTEND_URL;
const root = resolve(import.meta.dirname, "..");
const accessToken = await readAccessToken(root);
const browser = await launchBrowser();

try {
  const publicResult = await verifyPublicPage(browser);
  const authenticatedResult = await verifyAuthenticatedFlow(browser, accessToken);

  console.log(
    JSON.stringify(
      {
        ok: true,
        frontendUrl,
        public: publicResult,
        authenticated: authenticatedResult
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}

async function verifyPublicPage(browserInstance) {
  const context = await browserInstance.newContext({
    colorScheme: "dark",
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  const diagnostics = collectDiagnostics(page);

  try {
    const response = await page.goto(frontendUrl, {
      waitUntil: "networkidle",
      timeout: 60_000
    });
    await page.waitForSelector("[data-app-shell] > *", { timeout: 15_000 });
    await page.waitForTimeout(1_000);

    const headers = response?.headers() || {};
    const state = await page.evaluate(() => ({
      title: document.title,
      heading: document.querySelector("h1")?.textContent?.trim() || "",
      appChildren: document.querySelector("[data-app-shell]")?.children.length || 0
    }));

    assert(response?.status() === 200, `Public page returned ${response?.status()}.`);
    assert(
      headers["content-type"]?.startsWith("text/html"),
      "Public page did not return HTML."
    );
    assert(
      !headers["content-disposition"],
      "Public page still has a download Content-Disposition header."
    );
    assert(state.appChildren > 0, "The application shell did not render.");
    assertDiagnosticsClean(diagnostics, "public page");

    return {
      status: response.status(),
      contentType: headers["content-type"],
      contentDisposition: headers["content-disposition"] || null,
      title: state.title,
      heading: state.heading,
      consoleErrors: diagnostics.consoleErrors.length,
      failedRequests: diagnostics.failedRequests.length
    };
  } finally {
    await context.close();
  }
}

async function verifyAuthenticatedFlow(browserInstance, token) {
  const context = await browserInstance.newContext({
    colorScheme: "dark",
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();
  const diagnostics = collectDiagnostics(page);
  const listingsResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/listings") &&
      response.request().method() === "GET",
    { timeout: 60_000 }
  );

  try {
    await page.goto(`${frontendUrl}#access=${encodeURIComponent(token)}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000
    });
    const listings = await listingsResponse;
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("[data-action='run-autopilot']", { timeout: 15_000 });

    const safeLocation = await page.evaluate(() => ({
      href: window.location.href,
      tokenStoredForSession: Boolean(
        window.sessionStorage.getItem("quotex:cloud-access-token")
      )
    }));
    assert(!safeLocation.href.includes("access="), "Access token remained in the URL.");
    assert(safeLocation.tokenStoredForSession, "Access token was not retained for this tab.");
    assert(listings.status() === 200, `Listings API returned ${listings.status()}.`);

    const runResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/run-agent") &&
        response.request().method() === "POST",
      { timeout: 90_000 }
    );
    await page.locator("[data-action='run-autopilot']").first().click();
    const runResponse = await runResponsePromise;
    const payload = await runResponse.json();
    await page.waitForFunction(
      () => !document.querySelector("[data-action='run-autopilot'][disabled]"),
      undefined,
      { timeout: 90_000 }
    );

    assert(runResponse.status() === 200, `Agent API returned ${runResponse.status()}.`);
    assert(payload?.ok === true, payload?.error || "Agent API did not return ok=true.");
    assert(payload?.trace?.status === "live", "Agent response was not a live Qwen run.");
    assertDiagnosticsClean(diagnostics, "authenticated flow");

    const screenshotPath = resolve(root, ".runtime", "live-browser-proof.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return {
      listingsStatus: listings.status(),
      tokenRemovedFromUrl: true,
      tokenStoredForSession: true,
      agentStatus: runResponse.status(),
      traceStatus: payload.trace.status,
      model: payload.trace.model || payload.agentRun?.model || "unknown",
      endpointHost:
        payload.trace.endpointHost || payload.agentRun?.endpointHost || "unknown",
      elapsedMs: payload.trace.elapsedMs || payload.agentRun?.elapsedMs || null,
      plannerTurns: payload.agentRun?.plannerTurns ?? null,
      completedSkills: payload.agentRun?.completedSkills?.length ?? null,
      requiredSkills: payload.agentRun?.requiredSkills?.length ?? null,
      approvalGate: payload.agentRun?.approvalGate || null,
      screenshot: screenshotPath,
      consoleErrors: diagnostics.consoleErrors.length,
      failedRequests: diagnostics.failedRequests.length
    };
  } finally {
    await context.close();
  }
}

function collectDiagnostics(page) {
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: []
  };

  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => diagnostics.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText || "Request failed"
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      diagnostics.badResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  return diagnostics;
}

function assertDiagnosticsClean(diagnostics, label) {
  const failures = [
    ...diagnostics.consoleErrors.map((message) => `console: ${message}`),
    ...diagnostics.pageErrors.map((message) => `page: ${message}`),
    ...diagnostics.failedRequests.map(
      (failure) => `request: ${failure.error} (${failure.url})`
    ),
    ...diagnostics.badResponses.map(
      (response) => `response: ${response.status} (${response.url})`
    )
  ];
  assert(!failures.length, `${label} had browser errors:\n${failures.join("\n")}`);
}

async function readAccessToken(projectRoot) {
  const environment = await readFile(resolve(projectRoot, ".env"), "utf8");
  const match = environment.match(
    /^\s*(?:export\s+)?QUOTEX_ACCESS_TOKEN\s*=\s*(.+?)\s*$/m
  );
  const token = unquote(match?.[1] || "");
  assert(token, "QUOTEX_ACCESS_TOKEN is missing from .env.");
  return token;
}

async function launchBrowser() {
  const options = { headless: true };

  try {
    await access(DEFAULT_CHROME_PATH);
    return chromium.launch({ ...options, executablePath: DEFAULT_CHROME_PATH });
  } catch {
    return chromium.launch(options);
  }
}

function unquote(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
