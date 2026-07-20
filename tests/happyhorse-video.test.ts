import assert from "node:assert/strict";
import {
  getProductVideoStatus,
  submitProductVideo
} from "../server/happyhorse-video.js";
import { createTestConfig } from "./test-config.js";

const config = createTestConfig();
let submitBody: any = null;
let asyncHeader = "";
const submitted = await submitProductVideo({
  config,
  payload: {
    media: {
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
      mimeType: "image/png",
      sizeBytes: 24
    },
    prompt: "Slow premium product push-in. Preserve the exact product.",
    resolution: "720P",
    duration: 5
  },
  fetchImpl: async (_input, init) => {
    submitBody = JSON.parse(String(init?.body));
    asyncHeader = new Headers(init?.headers).get("X-DashScope-Async") || "";
    return new Response(
      JSON.stringify({
        request_id: "video-submit-request",
        output: { task_id: "task-12345678", task_status: "PENDING" }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});

assert.equal(submitted.asset.status, "PENDING");
assert.equal(submitted.trace.status, "video-task-submitted");
assert.equal(asyncHeader, "enable");
assert.equal(submitBody.model, "happyhorse-1.0-i2v");
assert.equal(submitBody.input.media[0].type, "first_frame");
assert.match(submitBody.input.media[0].url, /^data:image\/png;base64,/);
assert.equal(submitBody.parameters.duration, 5);
assert.equal(submitBody.parameters.resolution, "720P");
assert.equal(submitBody.parameters.watermark, true);

let statusUrl = "";
const completed = await getProductVideoStatus({
  config,
  taskId: submitted.asset.taskId,
  prompt: submitted.asset.prompt,
  resolution: submitted.asset.resolution,
  duration: submitted.asset.duration,
  fetchImpl: async (input) => {
    statusUrl = String(input);
    return new Response(
      JSON.stringify({
        request_id: "video-status-request",
        output: {
          task_id: "task-12345678",
          task_status: "SUCCEEDED",
          video_url: "https://example.test/generated-product.mp4",
          orig_prompt: "Slow premium product push-in. Preserve the exact product."
        },
        usage: { video_duration: 5 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
});

assert.equal(statusUrl, "https://example.test/api/v1/tasks/task-12345678");
assert.equal(completed.asset.status, "SUCCEEDED");
assert.equal(completed.asset.videoUrl, "https://example.test/generated-product.mp4");
assert.equal(completed.trace.status, "live-video");
assert.equal(completed.trace.assetPersistence, "provider-url");

console.log("happyhorse-video tests passed");
