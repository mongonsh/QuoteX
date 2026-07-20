import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(tmpdir(), "quotex-cinematic-stills");
const moments = [2.5, 9, 18, 34, 48, 60, 71, 81, 90, 97, 100.5];

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--allow-file-access-from-files", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
await page.goto(pathToFileURL(path.join(moduleDirectory, "index.html")).href, {
  waitUntil: "load",
});
await page.waitForFunction(() => window.__filmReady || window.__filmError, null, {
  timeout: 20_000,
});
const loadError = await page.evaluate(() => window.__filmError ?? null);
if (loadError) throw new Error(loadError);

for (const moment of moments) {
  await page.evaluate((milliseconds) => window.renderAt(milliseconds), moment * 1_000);
  await page.screenshot({
    path: path.join(outputDirectory, `${String(moment).padStart(5, "0").replace(".", "_")}s.png`),
    type: "png",
  });
}

await browser.close();
console.log(outputDirectory);
