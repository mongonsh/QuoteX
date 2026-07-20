import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeMotionSoundtrack } from "./soundtrack.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDirectory, "../..");
const generatedDirectory = path.join(moduleDirectory, "public", "generated");
const runtimeDirectory = path.join(projectRoot, ".runtime", "demo");

const inputs = [
  ["assets/demo/mongolian-cashmere-scarves.png", "cashmere-product.png"],
  ["docs/screenshots/quotex-workbench.png", "workbench.png"],
  ["docs/screenshots/quotex-live-agent-evidence.png", "live-agent-evidence.png"],
  ["docs/screenshots/quotex-voice-agent.png", "voice-agent.png"],
  ["docs/screenshots/quotex-campaign-proof.jpg", "campaign-proof.jpg"],
  ["docs/screenshots/quotex-marketplace-proof.jpg", "marketplace-proof.jpg"],
  ["diagrams/quotex-agent-architecture.png", "architecture.png"],
  [".runtime/demo/QuoteX-demo-final.mp4", "evidence-demo.mp4"],
  [".runtime/demo/QuoteX-motion-narration-soft.wav", "narration.wav"],
  [".runtime/demo/MA_Awesomemusic_ModernInterior.wav", "music.wav"],
];

const assertInput = async (filePath) => {
  try {
    const metadata = await stat(filePath);
    if (metadata.size > 0) return metadata.size;
  } catch {
    // The error below includes the exact missing artifact.
  }
  throw new Error(`Required motion-film input is missing or empty: ${filePath}`);
};

export const prepareMotionAssets = async () => {
  await mkdir(generatedDirectory, { recursive: true });

  const copied = [];
  for (const [sourceName, targetName] of inputs) {
    const source = path.join(projectRoot, sourceName);
    const target = path.join(generatedDirectory, targetName);
    const size = await assertInput(source);
    await copyFile(source, target);
    copied.push({ target: targetName, size });
  }

  const soundtrack = path.join(generatedDirectory, "motion-soundtrack.wav");
  await writeMotionSoundtrack(soundtrack, 102.4);
  const soundtrackSize = await assertInput(soundtrack);

  return {
    generatedDirectory,
    runtimeDirectory,
    copied,
    soundtrack: { target: "motion-soundtrack.wav", size: soundtrackSize },
  };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await prepareMotionAssets();
  console.log(JSON.stringify(result, null, 2));
}
