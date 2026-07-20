import { access, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import ffmpegPath from "ffmpeg-static";

import { prepareMotionAssets } from "./prepare-assets.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "../..");
const runtimeDirectory = path.join(projectRoot, ".runtime", "demo");
const renderDirectory = path.join(tmpdir(), "quotex-remotion-render");
const fullOutput = path.join(runtimeDirectory, "QuoteX-motion-demo.mp4");
const previewOutput = path.join(runtimeDirectory, "QuoteX-motion-preview.mp4");
const rawOutput = path.join(renderDirectory, "QuoteX-motion-raw.mp4");
const stillDirectory = path.join(runtimeDirectory, "motion-stills");
const entryPoint = path.join(moduleDirectory, "src", "index.jsx");
const publicDirectory = path.join(moduleDirectory, "public");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const portBase = 20_000 + (process.pid % 10_000) * 2;
const compositionPort = portBase;
const rendererPort = portBase + 1;

const previewIndex = process.argv.indexOf("--preview");
const previewSeconds =
  previewIndex >= 0
    ? Math.max(2, Math.min(30, Number(process.argv[previewIndex + 1] ?? 12)))
    : null;
const segmentIndex = process.argv.indexOf("--segment");
const segment =
  segmentIndex >= 0
    ? {
        start: Math.max(0, Number(process.argv[segmentIndex + 1] ?? 0)),
        duration: Math.max(2, Math.min(30, Number(process.argv[segmentIndex + 2] ?? 8))),
      }
    : null;
const renderStills = process.argv.includes("--stills");

const command = (executable, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} exited with code ${code}.`));
    });
  });

const remotionWebpackOverride = (config) => {
  const rules = config.module?.rules ?? [];
  for (const rule of rules) {
    if (!Array.isArray(rule.use)) continue;
    for (const loader of rule.use) {
      if (!loader?.loader?.includes("@remotion/bundler/dist/esbuild-loader")) continue;
      loader.options = {
        ...loader.options,
        tsconfigRaw: {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
          },
        },
      };
    }
  }
  return config;
};

await mkdir(runtimeDirectory, { recursive: true });
await mkdir(renderDirectory, { recursive: true });
await prepareMotionAssets();

let browserExecutable;
try {
  await access(chromePath);
  browserExecutable = chromePath;
} catch {
  browserExecutable = undefined;
}

console.log("Bundling QuoteX motion film...");
const serveUrl = await bundle({
  entryPoint,
  publicDir: publicDirectory,
  webpackOverride: remotionWebpackOverride,
  onProgress: (progress) => {
    if (Math.round(progress) % 20 === 0) {
      process.stdout.write(`Bundle ${Math.round(progress)}%\r`);
    }
  },
});

const composition = await selectComposition({
  serveUrl,
  id: "QuoteXMotionFilm",
  browserExecutable,
  port: compositionPort,
  logLevel: "warn",
});

if (renderStills) {
  await mkdir(stillDirectory, { recursive: true });
  const stillSeconds = [4.4, 16.8, 34.7, 48.5, 60.2, 70.4, 82.8, 90.7, 101.4];
  for (const seconds of stillSeconds) {
    const frame = Math.round(seconds * composition.fps);
    const output = path.join(stillDirectory, `frame-${String(frame).padStart(4, "0")}.png`);
    await renderStill({
      serveUrl,
      composition,
      frame,
      output,
      imageFormat: "png",
      browserExecutable,
      port: rendererPort,
      overwrite: true,
      logLevel: "warn",
    });
    console.log(`Rendered still ${seconds.toFixed(1)}s -> ${output}`);
  }
  process.exit(0);
}

const frameRange = segment
  ? [
      Math.round(segment.start * composition.fps),
      Math.min(
        composition.durationInFrames - 1,
        Math.round((segment.start + segment.duration) * composition.fps) - 1,
      ),
    ]
  : previewSeconds
    ? [
        0,
        Math.min(
          composition.durationInFrames - 1,
          Math.round(previewSeconds * composition.fps) - 1,
        ),
      ]
    : null;
let lastReported = -1;

await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  outputLocation: rawOutput,
  browserExecutable,
  port: rendererPort,
  frameRange,
  crf: 16,
  pixelFormat: "yuv420p",
  x264Preset: "medium",
  audioBitrate: "192k",
  overwrite: true,
  concurrency: previewSeconds || segment ? 3 : 1,
  logLevel: "warn",
  onProgress: ({ progress }) => {
    const percent = Math.floor(progress * 100);
    if (percent >= lastReported + 5) {
      lastReported = percent;
      console.log(`Render ${percent}%`);
    }
  },
});

const output = segment
  ? path.join(
      runtimeDirectory,
      `QuoteX-motion-segment-${segment.start.toFixed(1).replace(".", "_")}.mp4`,
    )
  : previewSeconds
    ? previewOutput
    : fullOutput;
await command(ffmpegPath, [
  "-hide_banner",
  "-y",
  "-i",
  rawOutput,
  "-map",
  "0:v:0",
  "-map",
  "0:a:0",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-profile:v",
  "high",
  "-vf",
  "scale=in_range=full:out_range=tv,unsharp=5:5:0.32:3:3:0.08,format=yuv420p",
  "-pix_fmt",
  "yuv420p",
  "-color_range",
  "tv",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-af",
  "loudnorm=I=-15:TP=-1.5:LRA=10",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-ar",
  "48000",
  "-movflags",
  "+faststart",
  output,
]);

const metadata = await stat(output);
console.log(
  JSON.stringify(
    {
      output,
      sizeBytes: metadata.size,
      durationSeconds:
        segment?.duration ?? previewSeconds ?? composition.durationInFrames / composition.fps,
      renderer: "Remotion 4 frame-based film",
      audio:
        "Soft CosyVoice narration + MA_Awesomemusic_ModernInterior + synchronized interface sound design",
    },
    null,
    2,
  ),
);
