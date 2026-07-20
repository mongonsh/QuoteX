import assert from "node:assert/strict";
import { transcribeAudioWithQwen } from "../server/qwen-asr.js";
import { createTestConfig } from "./test-config.js";

const originalFetch = globalThis.fetch;
let requestBody: any = null;

globalThis.fetch = async (_url, options) => {
  requestBody = JSON.parse(String(options?.body));

  return new Response(
    JSON.stringify({
      model: "qwen3-asr-flash",
      choices: [{ message: { content: "Please quote 240 replacement filters for delivery to Seattle by August 15." } }],
      usage: { total_tokens: 94 },
      request_id: "asr-test"
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

try {
  const result = await transcribeAudioWithQwen({
    config: createTestConfig({ timeoutMs: 100 }),
    payload: {
      languageHint: "English",
      audio: {
        dataUrl: "data:audio/webm;base64,AAAA",
        mimeType: "audio/webm",
        sizeBytes: 4
      }
    }
  });

  assert.equal(result.ok, true);
  assert.match(result.transcript, /240 replacement filters/);
  assert.equal(result.trace.status, "live-asr");
  assert.equal(requestBody.model, "qwen3-asr-flash");
  assert.equal(requestBody.messages[0].role, "system");
  assert.match(requestBody.messages[0].content[0].text, /complete recording/i);
  assert.equal(requestBody.messages[1].content.length, 1);
  assert.equal(requestBody.messages[1].content[0].type, "input_audio");
  assert.equal(requestBody.messages[1].content[0].input_audio.data, "data:audio/webm;base64,AAAA");
  assert.equal(requestBody.asr_options.language, "en");
  assert.equal(requestBody.asr_options.enable_itn, true);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("qwen-asr tests passed");
