import type { AppConfig, QwenTrace, QwenUsage } from "../src/types.js";

interface AudioInput {
  dataUrl?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}

interface TranscriptionPayload {
  audio?: AudioInput;
  languageHint?: unknown;
}

interface QwenAsrResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  usage?: QwenUsage;
  error?: { message?: string };
  message?: string;
  request_id?: string;
}

export interface TranscriptionResult {
  ok: true;
  transcript: string;
  trace: QwenTrace;
}

const MAX_AUDIO_DATA_URL_BYTES = 9_500_000;
const AUDIO_DATA_URL_PATTERN =
  /^data:audio\/(?:webm|mp4|mpeg|mp3|wav|x-wav|ogg|flac|aac|m4a);(?:codecs=[^;,]+;)?base64,[A-Za-z0-9+/=]+$/i;

export async function transcribeAudioWithQwen({
  config,
  payload
}: {
  config: AppConfig;
  payload: TranscriptionPayload;
}): Promise<TranscriptionResult> {
  if (!config.qwen.speechApiKey) {
    throw statusError("DASHSCOPE_API_KEY or QWEN_ASR_API_KEY is required for Qwen ASR", 400);
  }

  const audio = validateAudio(payload.audio);
  const languageHint = cleanLanguageHint(payload.languageHint);
  const language = toAsrLanguage(languageHint);
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.qwen.timeoutMs);

  try {
    const response = await fetch(`${config.qwen.speechBaseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.qwen.speechApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.qwen.speechModel,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: languageHint
                  ? `Transcribe the complete recording accurately. Expected language: ${languageHint}. Preserve product codes, quantities, prices, dates, company names, and place names.`
                  : "Transcribe the complete recording accurately. Preserve product codes, quantities, prices, dates, company names, and place names."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: audio.dataUrl }
              }
            ]
          }
        ],
        stream: false,
        asr_options: {
          ...(language ? { language } : {}),
          enable_itn: true
        }
      })
    });
    const data = (await response.json().catch(() => ({}))) as QwenAsrResponse;

    if (!response.ok) {
      throw statusError(
        data.error?.message || data.message || `Qwen ASR returned ${response.status}`,
        response.status
      );
    }

    const transcript = extractTranscript(data.choices?.[0]?.message?.content);
    if (!transcript) throw statusError("Qwen ASR returned an empty transcript", 502);

    return {
      ok: true,
      transcript,
      trace: {
        status: "live-asr",
        model: data.model || config.qwen.speechModel,
        endpointHost: safeHost(config.qwen.speechBaseUrl),
        elapsedMs: Math.round(performance.now() - startedAt),
        usage: data.usage || null,
        requestId: data.request_id || null,
        inputGrounding: `${audio.mimeType} voice recording (${formatBytes(audio.sizeBytes)})`
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateAudio(audio: AudioInput | undefined): {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
} {
  const dataUrl = typeof audio?.dataUrl === "string" ? audio.dataUrl : "";
  const mimeType = typeof audio?.mimeType === "string" ? audio.mimeType : "";
  const sizeBytes = Number(audio?.sizeBytes || 0);

  if (!AUDIO_DATA_URL_PATTERN.test(dataUrl)) {
    throw statusError("A supported Base64 audio recording is required", 400);
  }

  if (Buffer.byteLength(dataUrl, "utf8") > MAX_AUDIO_DATA_URL_BYTES) {
    throw statusError("Audio recording exceeds the 9.5 MB request limit", 413);
  }

  return {
    dataUrl,
    mimeType: mimeType.startsWith("audio/") ? mimeType : dataUrl.slice(5, dataUrl.indexOf(";")),
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0
  };
}

function extractTranscript(content: string | Array<{ text?: string }> | undefined): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .join(" ")
    .trim();
}

function cleanLanguageHint(value: unknown): string {
  return typeof value === "string" ? value.replace(/[^a-zA-Z -]/g, "").slice(0, 40).trim() : "";
}

function toAsrLanguage(value: string): string {
  const language = value.toLowerCase();
  if (language.includes("english")) return "en";
  if (language.includes("japanese")) return "ja";
  if (language.includes("german")) return "de";
  if (language.includes("korean")) return "ko";
  if (language.includes("chinese")) return "zh";
  if (language.includes("spanish")) return "es";
  if (language.includes("french")) return "fr";
  return "";
}

function statusError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
