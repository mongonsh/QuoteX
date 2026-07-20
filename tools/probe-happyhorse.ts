import {
  getProductVideoStatus,
  submitProductVideo
} from "../server/happyhorse-video.js";
import { loadConfig } from "../server/config.js";
import { makeProductTestPngDataUrl } from "./product-test-image.js";

const config = await loadConfig();
const dataUrl = makeProductTestPngDataUrl();

try {
  const submitted = await submitProductVideo({
    config,
    payload: {
      media: {
        dataUrl,
        mimeType: "image/png",
        sizeBytes: Buffer.from(dataUrl.split(",")[1] || "", "base64").length
      },
      prompt:
        "A premium product sits on a clean studio surface. Slow camera push-in, subtle parallax, natural light movement, preserve the exact shape and colors, no text.",
      resolution: "720P",
      duration: 3
    }
  });

  console.log(JSON.stringify({
    ok: true,
    stage: "submitted",
    model: submitted.asset.model,
    taskId: submitted.asset.taskId,
    status: submitted.asset.status
  }));

  const deadline = Date.now() + config.qwen.videoTimeoutMs;
  let current = submitted;
  while (
    current.asset.status !== "SUCCEEDED" &&
    current.asset.status !== "FAILED" &&
    Date.now() < deadline
  ) {
    await sleep(15_000);
    current = await getProductVideoStatus({
      config,
      taskId: submitted.asset.taskId,
      prompt: submitted.asset.prompt,
      resolution: submitted.asset.resolution,
      duration: submitted.asset.duration
    });
    console.log(JSON.stringify({
      ok: current.asset.status !== "FAILED",
      stage: "poll",
      model: current.asset.model,
      taskId: current.asset.taskId,
      status: current.asset.status,
      videoUrl: current.asset.videoUrl || null,
      error: current.asset.error || null
    }));
  }

  if (current.asset.status !== "SUCCEEDED") {
    throw new Error(current.asset.error || "HappyHorse did not finish before the probe timeout");
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    model: config.qwen.videoModel,
    endpointHost: safeHost(config.qwen.videoEndpoint),
    error: error instanceof Error ? error.message : String(error)
  }));
  process.exitCode = 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}
