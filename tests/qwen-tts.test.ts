import assert from "node:assert/strict";
import {
  getDesignedVoiceStatus,
  synthesizeSpeech,
  type DesignedVoiceStore
} from "../server/qwen-tts.js";
import { createTestConfig, TEST_CREDENTIALS } from "./test-config.js";

const requests: Array<{ url: string; body: any; authorization: string }> = [];
let cachedProfile: Awaited<ReturnType<DesignedVoiceStore["load"]>> = null;
const streamingWav = createStreamingWav();
let audioDownloadAttempts = 0;
const voiceStore: DesignedVoiceStore = {
  async load() {
    return cachedProfile;
  },
  async save(profile) {
    cachedProfile = profile;
  }
};

const fetchImpl: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url === "https://example.test/generated-voice.wav") {
    audioDownloadAttempts += 1;
    if (audioDownloadAttempts === 1) throw new TypeError("fetch failed");
    const audioBody = streamingWav.buffer.slice(
      streamingWav.byteOffset,
      streamingWav.byteOffset + streamingWav.byteLength
    ) as ArrayBuffer;
    return new Response(audioBody, {
      status: 200,
      headers: { "Content-Type": "audio/x-wav" }
    });
  }

  const body = JSON.parse(String(init?.body));
  requests.push({
    url,
    body,
    authorization: new Headers(init?.headers).get("Authorization") || ""
  });

  if (url.endsWith("/services/audio/tts/customization")) {
    return new Response(
      JSON.stringify({
        output: {
          voice: "quotex-voice-2026",
          preview_audio: { data: "UklGRgECAwQ=" }
        },
        request_id: "voice-design-request"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      output: { audio: { url: "https://example.test/generated-voice.wav" } },
      usage: { total_tokens: 42 },
      request_id: "tts-request"
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

const config = createTestConfig();
const first = await synthesizeSpeech({
  config,
  fetchImpl,
  voiceStore,
  payload: {
    text: "Your quote is pending human approval.",
    language: "English"
  }
});

assert.equal(first.ok, true);
assert.equal(first.provider, "Qwen Voice Design");
assert.equal(first.voice, "quotex-voice-2026");
assert.equal(first.voiceDesignedNow, true);
assert.match(first.audioDataUrl, /^data:audio\/wav;base64,/);
assert.equal(first.mimeType, "audio/wav");
assert.match(first.voicePreviewDataUrl || "", /^data:audio\/wav;base64,/);
const normalizedWav = Buffer.from(first.audioDataUrl.split(",")[1]!, "base64");
assert.equal(normalizedWav.readUInt32LE(4), normalizedWav.length - 8);
assert.equal(normalizedWav.readUInt32LE(40), normalizedWav.length - 44);
assert.equal(audioDownloadAttempts, 2);
assert.equal(first.trace.status, "live-voice-design-tts");
assert.equal(first.trace.voiceDesignModel, "qwen-voice-design");
assert.equal(first.trace.assetPersistence, "embedded-data-url");

assert.equal(requests[0]?.authorization, `Bearer ${TEST_CREDENTIALS.ttsApiKey}`);
assert.equal(requests[0]?.body.model, "qwen-voice-design");
assert.equal(requests[0]?.body.input.action, "create");
assert.equal(requests[0]?.body.input.target_model, "qwen3-tts-vd-2026-01-26");
assert.match(requests[0]?.body.input.voice_prompt, /warm young adult female voice/i);
assert.equal(requests[1]?.body.model, "qwen3-tts-vd-2026-01-26");
assert.equal(requests[1]?.body.input.voice, "quotex-voice-2026");
assert.equal(requests[1]?.body.input.text, "Your quote is pending human approval.");

const second = await synthesizeSpeech({
  config,
  fetchImpl,
  voiceStore,
  payload: { text: "The shipment is planned for three days.", language: "English" }
});

assert.equal(second.voiceDesignedNow, false);
assert.equal(second.trace.status, "live-designed-tts");
assert.equal(requests.filter((request) => request.body.model === "qwen-voice-design").length, 1);
assert.deepEqual(
  await getDesignedVoiceStatus({ config, voiceStore }),
  { voice: "quotex-voice-2026", cached: true }
);

await assert.rejects(
  synthesizeSpeech({
    config: createTestConfig({ ttsModel: "qwen3-tts-flash" }),
    fetchImpl,
    voiceStore,
    payload: { text: "This target should be rejected." }
  }),
  /must match TTS model/
);

let rejectedDownloadAttempts = 0;
const permanentDownloadFailure: typeof fetch = async (input) => {
  const url = String(input);
  if (url === "https://example.test/rejected-voice.wav") {
    rejectedDownloadAttempts += 1;
    return new Response("expired", { status: 403 });
  }
  return new Response(
    JSON.stringify({
      output: { audio: { url: "https://example.test/rejected-voice.wav" } }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
await assert.rejects(
  synthesizeSpeech({
    config,
    fetchImpl: permanentDownloadFailure,
    voiceStore,
    payload: { text: "This signed asset is no longer available." }
  }),
  /returned 403/
);
assert.equal(rejectedDownloadAttempts, 1);

console.log("qwen-tts tests passed");

function createStreamingWav(): Uint8Array {
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(0x7fff_ffbf, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24_000, 24);
  wav.writeUInt32LE(48_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(0x7fff_ff9b, 40);
  wav.writeInt16LE(100, 44);
  wav.writeInt16LE(-100, 46);
  return wav;
}
