import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig, QwenTrace, QwenUsage } from "../src/types.js";

interface TtsPayload {
  text?: unknown;
  language?: unknown;
}

interface VoiceDesignResponse {
  output?: {
    voice?: string;
    preview_audio?: { data?: string };
  };
  usage?: QwenUsage;
  code?: string;
  message?: string;
  request_id?: string;
}

interface TtsResponse {
  output?: {
    audio?: string | { url?: string; data?: string; id?: string };
    audio_url?: string;
    url?: string;
    data?: string;
  };
  usage?: QwenUsage;
  code?: string;
  message?: string;
  request_id?: string;
}

interface DesignedVoiceProfile {
  voice: string;
  designModel: string;
  targetModel: string;
  previewAudioDataUrl?: string;
  createdAt: string;
}

export interface DesignedVoiceStore {
  load(): Promise<DesignedVoiceProfile | null>;
  save(profile: DesignedVoiceProfile): Promise<void>;
}

export interface SpeechSynthesisResult {
  ok: true;
  audioDataUrl: string;
  mimeType: string;
  voice: string;
  provider: string;
  voiceDesignedNow: boolean;
  voicePreviewDataUrl?: string;
  trace: QwenTrace;
}

export interface DesignedVoiceStatus {
  voice: string;
  cached: boolean;
}

const VOICE_CACHE_PATH =
  process.env.QWEN_VOICE_CACHE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/tmp/qwen-voice-profile.json"
    : ".runtime/qwen-voice-profile.json");
const DEFAULT_VOICE_PROMPT =
  "A warm young adult female voice with a calm, reassuring tone, clear articulation, medium-low pitch, gentle pace, and subtle natural expressiveness, suitable for a trusted B2B customer support assistant.";
const DEFAULT_PREVIEW_TEXT =
  "Hello, I am the QuoteX customer assistant. I will explain your quote clearly and help you understand the next step.";
const MAX_PERSISTED_AUDIO_BYTES = 10_000_000;

const fileVoiceStore: DesignedVoiceStore = {
  async load() {
    try {
      return JSON.parse(await readFile(VOICE_CACHE_PATH, "utf8")) as DesignedVoiceProfile;
    } catch {
      return null;
    }
  },
  async save(profile) {
    await mkdir(dirname(VOICE_CACHE_PATH), { recursive: true });
    await writeFile(VOICE_CACHE_PATH, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  }
};

export async function getDesignedVoiceStatus({
  config,
  voiceStore = fileVoiceStore
}: {
  config: AppConfig;
  voiceStore?: DesignedVoiceStore;
}): Promise<DesignedVoiceStatus> {
  if (config.qwen.ttsVoice) {
    return { voice: config.qwen.ttsVoice, cached: false };
  }

  const cached = await voiceStore.load();
  const matchesCurrentModels = Boolean(
    cached?.voice &&
    cached.designModel === config.qwen.voiceDesignModel &&
    cached.targetModel === config.qwen.voiceDesignTargetModel
  );

  return {
    voice: matchesCurrentModels ? cached?.voice || "" : "",
    cached: matchesCurrentModels
  };
}

export async function synthesizeSpeech({
  config,
  payload,
  fetchImpl = fetch,
  voiceStore = fileVoiceStore
}: {
  config: AppConfig;
  payload: TtsPayload;
  fetchImpl?: typeof fetch;
  voiceStore?: DesignedVoiceStore;
}): Promise<SpeechSynthesisResult> {
  if (!config.qwen.ttsApiKey) {
    throw statusError("QWEN_TTS_API_KEY, DASHSCOPE_API_KEY, or QWEN_API_KEY is required", 400);
  }

  const text = cleanText(payload.text, 1_800);
  if (!text) throw statusError("Text is required for speech synthesis", 400);
  if (config.qwen.ttsModel !== config.qwen.voiceDesignTargetModel) {
    throw statusError(
      `Qwen Voice Design target ${config.qwen.voiceDesignTargetModel} must match TTS model ${config.qwen.ttsModel}`,
      400
    );
  }

  const startedAt = performance.now();
  const resolvedVoice = await resolveDesignedVoice({ config, fetchImpl, voiceStore });
  const { response, data } = await fetchJson<TtsResponse>(
    fetchImpl,
    config.qwen.ttsEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.ttsApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.qwen.ttsModel,
        input: {
          text,
          voice: resolvedVoice.profile.voice
        }
      })
    },
    config.qwen.timeoutMs
  );

  if (!response.ok || data.code) {
    throw statusError(
      data.message || `Qwen designed-voice TTS returned ${response.status}`,
      response.status || 502
    );
  }

  const audio = await extractResponseAudio(data, config.qwen.timeoutMs, fetchImpl);
  return {
    ok: true,
    audioDataUrl: audio.dataUrl,
    mimeType: audio.mimeType,
    voice: resolvedVoice.profile.voice,
    provider: "Qwen Voice Design",
    voiceDesignedNow: resolvedVoice.created,
    voicePreviewDataUrl: resolvedVoice.profile.previewAudioDataUrl,
    trace: {
      status: resolvedVoice.created ? "live-voice-design-tts" : "live-designed-tts",
      model: config.qwen.ttsModel,
      voiceDesignModel: config.qwen.voiceDesignModel,
      endpointHost: safeHost(config.qwen.ttsEndpoint),
      elapsedMs: Math.round(performance.now() - startedAt),
      usage: data.usage || null,
      requestId: data.request_id || null,
      assetPersistence: "embedded-data-url",
      response: {
        provider: "Qwen Voice Design",
        voice: resolvedVoice.profile.voice,
        voiceDesignedNow: resolvedVoice.created,
        targetModel: resolvedVoice.profile.targetModel,
        language: normalizeLanguage(payload.language)
      }
    }
  };
}

async function resolveDesignedVoice({
  config,
  fetchImpl,
  voiceStore
}: {
  config: AppConfig;
  fetchImpl: typeof fetch;
  voiceStore: DesignedVoiceStore;
}): Promise<{ profile: DesignedVoiceProfile; created: boolean }> {
  if (config.qwen.ttsVoice) {
    return {
      profile: {
        voice: config.qwen.ttsVoice,
        designModel: config.qwen.voiceDesignModel,
        targetModel: config.qwen.voiceDesignTargetModel,
        createdAt: "configured"
      },
      created: false
    };
  }

  const cached = await voiceStore.load();
  if (
    cached?.voice &&
    cached.designModel === config.qwen.voiceDesignModel &&
    cached.targetModel === config.qwen.voiceDesignTargetModel
  ) {
    return { profile: cached, created: false };
  }

  const { response, data } = await fetchJson<VoiceDesignResponse>(
    fetchImpl,
    config.qwen.voiceDesignEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.ttsApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.qwen.voiceDesignModel,
        input: {
          action: "create",
          target_model: config.qwen.voiceDesignTargetModel,
          voice_prompt: DEFAULT_VOICE_PROMPT,
          preview_text: DEFAULT_PREVIEW_TEXT,
          preferred_name: "quotex",
          language: "en"
        },
        parameters: {
          sample_rate: 24_000,
          response_format: "wav"
        }
      })
    },
    Math.max(config.qwen.timeoutMs, 60_000)
  );

  if (!response.ok || data.code || !data.output?.voice) {
    throw statusError(
      data.message || `Qwen Voice Design returned ${response.status}`,
      response.status || 502
    );
  }

  const previewData = data.output.preview_audio?.data;
  const profile: DesignedVoiceProfile = {
    voice: data.output.voice,
    designModel: config.qwen.voiceDesignModel,
    targetModel: config.qwen.voiceDesignTargetModel,
    previewAudioDataUrl: previewData
      ? `data:audio/wav;base64,${previewData.replace(/^data:audio\/[^;]+;base64,/i, "")}`
      : undefined,
    createdAt: new Date().toISOString()
  };
  await voiceStore.save(profile);
  return { profile, created: true };
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const data = (await response.json().catch(() => ({}))) as T;
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractResponseAudio(
  data: TtsResponse,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ dataUrl: string; mimeType: string }> {
  const outputAudio = data.output?.audio;
  const audioUrl =
    (typeof outputAudio === "object" ? outputAudio.url : "") ||
    data.output?.audio_url ||
    data.output?.url ||
    (typeof outputAudio === "string" && /^https?:\/\//i.test(outputAudio) ? outputAudio : "");
  const audioBase64 =
    (typeof outputAudio === "object" ? outputAudio.data : "") ||
    data.output?.data ||
    (typeof outputAudio === "string" && !/^https?:\/\//i.test(outputAudio) ? outputAudio : "");

  if (audioBase64) {
    const normalized = audioBase64.replace(/^data:audio\/[^;]+;base64,/i, "");
    if (normalized.length > Math.ceil((MAX_PERSISTED_AUDIO_BYTES * 4) / 3) + 4) {
      throw statusError("Generated speech exceeded the 10 MB persistence limit", 502);
    }
    const bytes = normalizeWavContainer(Buffer.from(normalized, "base64"));
    assertPersistableAudio(bytes);
    return {
      dataUrl: `data:audio/wav;base64,${bytes.toString("base64")}`,
      mimeType: "audio/wav"
    };
  }
  if (audioUrl) return downloadAudio(audioUrl, timeoutMs, fetchImpl);

  throw statusError("Qwen designed-voice TTS response did not contain audio", 502);
}

async function downloadAudio(
  audioUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ dataUrl: string; mimeType: string }> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await downloadAudioOnce(audioUrl, timeoutMs, fetchImpl);
    } catch (error) {
      lastError = error;
      const status = typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 0;
      const retryable = !status || status >= 500 || status === 408 || status === 429;
      if (!retryable || attempt === 3) throw error;
      await wait(200 * attempt);
    }
  }

  throw lastError;
}

async function downloadAudioOnce(
  audioUrl: string,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<{ dataUrl: string; mimeType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(audioUrl, { signal: controller.signal });
    if (!response.ok) {
      throw statusError(`Generated audio download returned ${response.status}`, response.status);
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "audio/wav";
    if (!mimeType.startsWith("audio/") && mimeType !== "application/octet-stream") {
      throw statusError("Generated speech asset was not audio", 502);
    }

    const downloaded = Buffer.from(await response.arrayBuffer());
    const bytes = normalizeWavContainer(downloaded);
    const safeMimeType = bytes !== downloaded
      ? "audio/wav"
      : mimeType === "application/octet-stream"
        ? "audio/wav"
        : mimeType;
    assertPersistableAudio(bytes);
    return {
      dataUrl: `data:${safeMimeType};base64,${bytes.toString("base64")}`,
      mimeType: safeMimeType
    };
  } finally {
    clearTimeout(timeout);
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertPersistableAudio(bytes: Buffer): void {
  if (!bytes.length) throw statusError("Generated speech asset was empty", 502);
  if (bytes.length > MAX_PERSISTED_AUDIO_BYTES) {
    throw statusError("Generated speech exceeded the 10 MB persistence limit", 502);
  }
}

function normalizeWavContainer(bytes: Buffer): Buffer {
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return bytes;
  }

  const normalized = Buffer.from(bytes);
  normalized.writeUInt32LE(normalized.length - 8, 4);

  let offset = 12;
  while (offset + 8 <= normalized.length) {
    const chunkId = normalized.toString("ascii", offset, offset + 4);
    const declaredSize = normalized.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      normalized.writeUInt32LE(normalized.length - offset - 8, offset + 4);
      break;
    }

    const paddedSize = declaredSize + (declaredSize % 2);
    const nextOffset = offset + 8 + paddedSize;
    if (nextOffset <= offset || nextOffset > normalized.length) break;
    offset = nextOffset;
  }

  return normalized;
}

function normalizeLanguage(value: unknown): string {
  const language = cleanText(value, 40).toLowerCase();
  if (language.includes("japanese")) return "ja";
  if (language.includes("korean")) return "ko";
  if (language.includes("chinese")) return "zh";
  return "en";
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}

function statusError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
