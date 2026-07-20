import { mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import ffmpegPath from "ffmpeg-static";
import { chromium } from "playwright";

import { writeSoundtrack } from "./soundtrack.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "../..");
const runtimeDirectory = path.join(projectRoot, ".runtime", "demo");
const renderDirectory = path.join(tmpdir(), "quotex-cinematic-render");
const narrationPath = path.join(runtimeDirectory, "QuoteX-demo-narration.wav");
const finalOutput = path.join(runtimeDirectory, "QuoteX-cinematic-demo.mp4");
const previewOutput = path.join(runtimeDirectory, "QuoteX-cinematic-preview.mp4");
const rawVideoPath = path.join(renderDirectory, "QuoteX-cinematic-visual.webm");
const soundtrackPath = path.join(renderDirectory, "QuoteX-cinematic-soundtrack.wav");

const previewIndex = process.argv.indexOf("--preview");
const previewSeconds =
  previewIndex >= 0 ? Math.max(2, Math.min(30, Number(process.argv[previewIndex + 1] ?? 8))) : null;
const durationSeconds = previewSeconds ?? 102.4;
const outputPath = previewSeconds ? previewOutput : finalOutput;

async function assertFile(filePath, guidance) {
  try {
    const metadata = await stat(filePath);
    if (metadata.size > 0) return;
  } catch {
    // Fall through to the actionable error below.
  }
  throw new Error(`${guidance}\nMissing file: ${filePath}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}.`));
    });
  });
}

await mkdir(runtimeDirectory, { recursive: true });
await mkdir(renderDirectory, { recursive: true });
await assertFile(
  narrationPath,
  "Create the Qwen-designed narration first or extract it from the evidence demo.",
);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--allow-file-access-from-files",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  acceptDownloads: true,
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") pageErrors.push(message.text());
});

const filmUrl = pathToFileURL(path.join(moduleDirectory, "index.html")).href;
await page.goto(filmUrl, { waitUntil: "load" });
await page.waitForFunction(() => window.__filmReady || window.__filmError, null, {
  timeout: 20_000,
});
const loadError = await page.evaluate(() => window.__filmError ?? null);
if (loadError) throw new Error(loadError);

const downloadPromise = page.waitForEvent("download", {
  timeout: (durationSeconds + 20) * 1_000,
});
await page.evaluate((durationMs) => window.startFilm({ durationMs }), durationSeconds * 1_000);
const download = await downloadPromise;
await download.saveAs(rawVideoPath);
await context.close();
await browser.close();

if (pageErrors.length > 0) {
  throw new Error(`Cinematic page error:\n${pageErrors.join("\n")}`);
}

await writeSoundtrack(soundtrackPath, durationSeconds);

const filter = [
  "[1:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=220|220,volume=1.0[voice]",
  "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.72[music]",
  "[voice][music]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[audio]",
].join(";");

await run(ffmpegPath, [
  "-hide_banner",
  "-y",
  "-i",
  rawVideoPath,
  "-i",
  narrationPath,
  "-i",
  soundtrackPath,
  "-filter_complex",
  filter,
  "-map",
  "0:v:0",
  "-map",
  "[audio]",
  "-t",
  durationSeconds.toFixed(3),
  "-r",
  "30",
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "16",
  "-profile:v",
  "high",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  outputPath,
]);

const outputMetadata = await stat(outputPath);
console.log(
  JSON.stringify(
    {
      output: outputPath,
      durationSeconds,
      sizeBytes: outputMetadata.size,
      source: "deterministic QuoteX canvas film + Qwen-designed narration + original procedural score",
    },
    null,
    2,
  ),
);
