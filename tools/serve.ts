import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { customers, products } from "../src/data.js";
import { loadConfig, loadEnvironment } from "../server/config.js";
import { generateMarketingAsset } from "../server/marketing-asset.js";
import { parseRfqWithQwen } from "../server/qwen-parser.js";
import { runQwenToolOrchestrator } from "../server/qwen-tool-orchestrator.js";
import { transcribeAudioWithQwen } from "../server/qwen-asr.js";
import { answerCustomerWithQwen } from "../server/customer-agent.js";
import { guideSellerIntakeWithQwen } from "../server/seller-intake-agent.js";
import { contentTypeForPath } from "../server/static-content.js";
import { createPersistence } from "../server/persistence.js";
import {
  getDesignedVoiceStatus,
  synthesizeSpeech
} from "../server/qwen-tts.js";
import {
  getProductVideoStatus,
  submitProductVideo
} from "../server/happyhorse-video.js";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const [config, environment] = await Promise.all([loadConfig(), loadEnvironment()]);
const accessToken = cleanAccessToken(environment.QUOTEX_ACCESS_TOKEN);
const accessCookie = accessToken ? accessTokenDigest(accessToken) : "";
const persistence = await createPersistence({ config, root });
const { listingStore, agentRunStore } = persistence;
const MAX_JSON_BODY_BYTES = 10_500_000;

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)"
};

const server = createServer(async (request, response) => {
  const requestContext = buildRequestContext(request);
  const requestStartedAt = performance.now();
  response.setHeader("X-QuoteX-Request-Id", requestContext.requestId);
  response.once("finish", () => {
    console.log(
      JSON.stringify({
        event: "http_request",
        requestId: requestContext.requestId,
        runtime: requestContext.runtime,
        functionName: requestContext.functionName,
        region: requestContext.region,
        method: request.method || "GET",
        path: String(request.url || "/").split("?")[0],
        status: response.statusCode,
        elapsedMs: Math.round(performance.now() - requestStartedAt)
      })
    );
  });

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (
      accessToken &&
      request.method === "GET" &&
      url.pathname === "/" &&
      url.searchParams.has("access")
    ) {
      const candidate = cleanAccessToken(url.searchParams.get("access"));
      if (!safeEqual(candidate, accessToken)) {
        sendJson(response, 401, {
          ok: false,
          error: "This QuoteX demo link is invalid or has expired."
        });
        return;
      }

      response.writeHead(303, {
        ...securityHeaders,
        "Cache-Control": "no-store",
        "Set-Cookie": buildAccessCookie(accessCookie, request),
        Location: "/"
      });
      response.end();
      return;
    }

    if (
      accessToken &&
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/health" &&
      !isAuthorizedRequest(request, accessToken, accessCookie)
    ) {
      sendJson(response, 401, {
        ok: false,
        error: "Open the private QuoteX demo link before using live AI services."
      });
      return;
    }

    if (url.pathname === "/api/listings" && request.method === "GET") {
      const listings = await listingStore.list();
      sendJson(response, 200, {
        ok: true,
        listings: listings.map(redactSellerContact)
      });
      return;
    }

    if (url.pathname === "/api/agent-runs" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 20);
      sendJson(response, 200, { ok: true, runs: await agentRunStore.list(limit) });
      return;
    }

    const agentRunRoute = url.pathname.match(/^\/api\/agent-runs\/([^/]+)$/);
    if (agentRunRoute && request.method === "GET") {
      const run = await agentRunStore.get(decodeURIComponent(agentRunRoute[1] || ""));
      sendJson(response, run ? 200 : 404, {
        ok: Boolean(run),
        run,
        error: run ? undefined : "Agent run not found."
      });
      return;
    }

    if (url.pathname === "/api/listings" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const listing = await listingStore.create(payload);
        sendJson(response, 201, { ok: true, listing });
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, failure.status || 500, {
          ok: false,
          error: failure.message || "The listing could not be saved."
        });
      }
      return;
    }

    const listingRoute = matchListingRoute(url.pathname);
    if (listingRoute?.resource === "photo" && request.method === "GET") {
      const stored = await listingStore.getPhoto(listingRoute.id);
      if (!stored) {
        sendJson(response, 404, { ok: false, error: "Listing photo not found." });
        return;
      }

      response.writeHead(200, {
        ...securityHeaders,
        "Content-Type": stored.photo.mimeType,
        "Content-Length": String(stored.bytes.length),
        "Cache-Control": "private, max-age=300"
      });
      response.end(stored.bytes);
      return;
    }

    if (listingRoute?.resource === "listing" && request.method === "DELETE") {
      const deleted = await listingStore.delete(listingRoute.id);
      sendJson(response, deleted ? 200 : 404, {
        ok: deleted,
        error: deleted ? undefined : "Listing not found."
      });
      return;
    }

    if (url.pathname === "/api/health") {
      const [designedVoice, listings, agentRuns] = await Promise.all([
        getDesignedVoiceStatus({ config }),
        listingStore.list(),
        agentRunStore.count()
      ]);
      sendJson(response, 200, {
        ok: true,
        qwen: {
          configured: Boolean(config.qwen.apiKey),
          agentConfigured: Boolean(config.qwen.agentApiKey),
          imageConfigured: Boolean(config.qwen.imageApiKey || config.qwen.apiKey),
          model: config.qwen.model,
          agentModel: config.qwen.agentModel,
          marketingModel: config.qwen.marketingModel,
          visionModel: config.qwen.visionModel,
          speechModel: config.qwen.speechModel,
          speechConfigured: Boolean(config.qwen.speechApiKey),
          ttsConfigured: Boolean(config.qwen.ttsApiKey),
          ttsModel: config.qwen.ttsModel,
          ttsVoice: designedVoice.voice,
          ttsVoiceCached: designedVoice.cached,
          voiceDesignModel: config.qwen.voiceDesignModel,
          voiceDesignTargetModel: config.qwen.voiceDesignTargetModel,
          ttsEndpointHost: safeHost(config.qwen.ttsEndpoint),
          imageModel: config.qwen.imageModel,
          imageFallbackModel: config.qwen.imageFallbackModel,
          imageEndpointHost: safeHost(config.qwen.imageEndpoint),
          videoConfigured: Boolean(config.qwen.videoApiKey),
          videoModel: config.qwen.videoModel,
          videoEndpointHost: safeHost(config.qwen.videoEndpoint),
          endpointHost: safeHost(config.qwen.baseUrl)
        },
        storage: {
          configured: true,
          provider: persistence.provider,
          database: persistence.database,
          objectStorage: persistence.objectStorage,
          durable: persistence.durable,
          listings: listings.length,
          agentRuns
        },
        runtime: {
          provider: requestContext.runtime,
          functionName: requestContext.functionName,
          region: requestContext.region,
          requestId: requestContext.requestId,
          accessProtected: Boolean(accessToken)
        }
      });
      return;
    }

    if (url.pathname === "/api/customer-agent" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await answerCustomerWithQwen({ config, payload });

        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "Customer voice agent failed",
          trace: {
            status: "error",
            model: config.qwen.agentModel,
            endpointHost: safeHost(config.qwen.agentBaseUrl),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/seller-intake-assistant" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await guideSellerIntakeWithQwen({ config, payload });
        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, failure.status || 502, {
          ok: false,
          error: failure.message || "Qwen seller intake failed.",
          trace: {
            status: "error",
            model: config.qwen.agentModel,
            endpointHost: safeHost(config.qwen.agentBaseUrl),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/synthesize-speech" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await synthesizeSpeech({ config, payload });

        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "Qwen speech synthesis failed",
          trace: {
            status: "error",
            model: config.qwen.ttsModel,
            endpointHost: safeHost(config.qwen.ttsEndpoint),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/transcribe-audio" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await transcribeAudioWithQwen({ config, payload });

        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "Qwen speech transcription failed",
          trace: {
            status: "error",
            model: config.qwen.speechModel,
            endpointHost: safeHost(config.qwen.speechBaseUrl),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/generate-marketing-asset" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await generateMarketingAsset({ config, payload });

        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, failure.status || 502, {
          ok: false,
          error: failure.message || "Marketing asset generation failed",
          trace: {
            status: "error",
            model: config.qwen.marketingModel,
            endpointHost: safeHost(config.qwen.baseUrl)
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/product-video" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await submitProductVideo({ config, payload });
        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "HappyHorse video generation failed",
          trace: {
            status: "error",
            model: config.qwen.videoModel,
            endpointHost: safeHost(config.qwen.videoEndpoint),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/product-video-status" && request.method === "GET") {
      try {
        const result = await getProductVideoStatus({
          config,
          taskId: url.searchParams.get("taskId") || ""
        });
        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "HappyHorse task query failed",
          trace: {
            status: "error",
            model: config.qwen.videoModel,
            endpointHost: safeHost(config.qwen.videoTaskBaseUrl),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/run-agent" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const customer =
          payload.customer ||
          customers.find((candidate) => candidate.id === payload.rfq?.customerId) ||
          customers[0]!;
        const result = await runQwenToolOrchestrator({
          config,
          payload: {
            rfq: payload.rfq,
            customer,
            products: payload.products || products
          },
          forceDeterministic: payload.forceDeterministic === true
        });
        await agentRunStore.save(
          result.agentRun,
          `${customer.company} - ${payload.rfq?.subject || "Cross-border request"}`
        );
        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, failure.status || 502, {
          ok: false,
          error: failure.message || "Qwen tool planner failed.",
          trace: {
            status: "error",
            model: config.qwen.agentModel,
            endpointHost: safeHost(config.qwen.agentBaseUrl),
            providerStatus: failure.status || 502
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/parse-rfq" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const customer =
          payload.customer ||
          customers.find((candidate) => candidate.id === payload.rfq?.customerId) ||
          customers[0]!;
        const result = await parseRfqWithQwen({
          config,
          payload: {
            rfq: payload.rfq,
            customer,
            products: payload.products || products
          }
        });

        sendJson(response, 200, result);
      } catch (error) {
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "Qwen parser failed",
          trace: {
            status: "error",
            model: config.qwen.model,
            endpointHost: safeHost(config.qwen.baseUrl)
          }
        });
      }
      return;
    }

    const pathname = url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/favicon.ico"
        ? "/assets/quotepilot-mark.svg"
        : url.pathname;
    const filePath = resolve(join(root, normalize(pathname)));

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403, securityHeaders);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders,
      "Content-Type": contentTypeForPath(filePath),
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    const pathname = String(request.url || "/").split("?")[0] || "/";
    if (pathname.startsWith("/api/")) {
      console.error(
        JSON.stringify({
          event: "http_error",
          requestId: requestContext.requestId,
          method: request.method || "GET",
          path: pathname,
          error: error instanceof Error ? error.message : "Unknown server error"
        })
      );
      sendJson(response, 500, {
        ok: false,
        error: "QuoteX could not complete this request.",
        requestId: requestContext.requestId
      });
      return;
    }

    response.writeHead(404, {
      ...securityHeaders,
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Not found");
  }
});

// Function Compute custom containers require long-lived keep-alive support.
server.requestTimeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;

server.listen(port, host, () => {
  console.log(`QuoteX running at http://${host}:${port}`);
  console.log(
    `Qwen ${config.qwen.apiKey ? "configured" : "not configured"}: ${config.qwen.model} via ${safeHost(
      config.qwen.baseUrl
    )}`
  );
  console.log(
    `Persistence ${persistence.provider}: ${persistence.database} + ${persistence.objectStorage}`
  );
});

let shutdownStarted = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => void shutdown(signal));
}

async function shutdown(signal: string): Promise<void> {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; closing QuoteX.`);
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  await persistence.close();
  process.exit(0);
}

function matchListingRoute(pathname: string): {
  id: string;
  resource: "listing" | "photo";
} | null {
  const match = pathname.match(/^\/api\/listings\/([^/]+)(?:\/(photo))?$/);
  if (!match) return null;

  const id = decodeURIComponent(match[1] || "");
  if (!id || id.length > 100) return null;

  return { id, resource: match[2] === "photo" ? "photo" : "listing" };
}

async function readJsonRequest(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error(
        "Request payload is too large. Use an image under 5 MB or a shorter voice recording."
      ) as Error & { status: number };
      error.status = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}

function toStatusError(value: unknown): Error & { status?: number } {
  return value instanceof Error
    ? (value as Error & { status?: number })
    : Object.assign(new Error(String(value)), { status: undefined });
}

function buildRequestContext(request: IncomingMessage): {
  requestId: string;
  runtime: "Alibaba Cloud Function Compute" | "Local Node";
  functionName: string;
  region: string;
} {
  const fcRequestId = headerText(request, "x-fc-request-id");
  const functionName = headerText(request, "x-fc-function-name");

  return {
    requestId: fcRequestId || randomUUID(),
    runtime: fcRequestId || functionName ? "Alibaba Cloud Function Compute" : "Local Node",
    functionName: functionName || "quotex-local",
    region: headerText(request, "x-fc-region") || "local"
  };
}

function headerText(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] || "" : typeof value === "string" ? value : "";
}

function cleanAccessToken(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 512) : "";
}

function accessTokenDigest(token: string): string {
  return createHash("sha256").update(`quotex-demo:${token}`).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isAuthorizedRequest(
  request: IncomingMessage,
  configuredToken: string,
  configuredCookie: string
): boolean {
  const headerToken = headerText(request, "x-quotex-access-token");
  if (headerToken && safeEqual(headerToken, configuredToken)) return true;

  const authorization = headerText(request, "authorization");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (bearer && safeEqual(bearer, configuredToken)) return true;

  const cookieHeader = headerText(request, "cookie");
  const cookieValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("quotex_access="))
    ?.slice("quotex_access=".length) || "";

  return Boolean(cookieValue && safeEqual(cookieValue, configuredCookie));
}

function buildAccessCookie(value: string, request: IncomingMessage): string {
  const forwardedProtocol = headerText(request, "x-forwarded-proto").toLowerCase();
  const secure =
    forwardedProtocol === "https" ||
    process.env.NODE_ENV === "production" ||
    headerText(request, "x-fc-request-id").length > 0;

  return [
    `quotex_access=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

function redactSellerContact<T extends { sellerEmail: string }>(listing: T): T {
  const [localPart = "", domain = ""] = listing.sellerEmail.split("@");
  const maskedEmail =
    localPart && domain
      ? `${localPart.slice(0, 1)}${"*".repeat(Math.min(3, Math.max(1, localPart.length - 1)))}@${domain}`
      : "private";

  return { ...listing, sellerEmail: maskedEmail };
}
