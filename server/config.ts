import { readFile } from "node:fs/promises";
import type { AppConfig } from "../src/types.js";

const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export async function loadConfig(): Promise<AppConfig> {
  const env = await loadEnvironment();
  const storageRegion =
    env.TABLESTORE_REGION ||
    env.ALIBABA_FC_REGION ||
    env.FC_REGION ||
    env.QWEN_REGION ||
    "ap-northeast-1";
  const tableStoreInstance = env.TABLESTORE_INSTANCE_NAME || "";
  const baseUrl = buildQwenBaseUrl(env);
  const internationalApiKey = env.DASHSCOPE_API_KEY || "";
  const agentApiKey = env.QWEN_AGENT_API_KEY || internationalApiKey || env.QWEN_API_KEY || "";
  const agentBaseUrl = env.QWEN_AGENT_BASE_URL || (internationalApiKey ? DEFAULT_QWEN_BASE_URL : baseUrl);
  const imageBaseUrl = buildQwenImageBaseUrl(env, baseUrl);
  const ttsBaseUrl = buildQwenTtsBaseUrl(env, baseUrl);
  const videoBaseUrl = buildQwenVideoBaseUrl(env, baseUrl);
  const imageModel = env.QWEN_IMAGE_MODEL || "wan2.7-image-pro";

  return {
    qwen: {
      apiKey: env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || "",
      agentApiKey,
      agentBaseUrl: stripTrailingSlash(agentBaseUrl),
      imageApiKey:
        env.QWEN_IMAGE_API_KEY ||
        env.QWEN_API_KEY ||
        env.DASHSCOPE_API_KEY ||
        "",
      speechApiKey: env.QWEN_ASR_API_KEY || internationalApiKey || env.QWEN_API_KEY || "",
      speechBaseUrl: stripTrailingSlash(
        env.QWEN_ASR_BASE_URL || (internationalApiKey ? DEFAULT_QWEN_BASE_URL : baseUrl)
      ),
      ttsApiKey:
        env.QWEN_TTS_API_KEY ||
        internationalApiKey ||
        env.QWEN_API_KEY ||
        "",
      baseUrl,
      model: env.QWEN_MODEL || "qwen3.7-plus",
      agentModel: env.QWEN_AGENT_MODEL || "qwen3.7-plus",
      marketingModel: env.QWEN_MARKETING_MODEL || "qwen3.7-plus",
      visionModel:
        env.QWEN_VISION_MODEL || env.QWEN_MARKETING_MODEL || "qwen3.7-plus",
      speechModel: env.QWEN_ASR_MODEL || "qwen3-asr-flash",
      voiceDesignModel: env.QWEN_VOICE_DESIGN_MODEL || "qwen-voice-design",
      voiceDesignTargetModel:
        env.QWEN_VOICE_DESIGN_TARGET_MODEL || "qwen3-tts-vd-2026-01-26",
      voiceDesignEndpoint:
        env.QWEN_VOICE_DESIGN_ENDPOINT ||
        `${ttsBaseUrl}/services/audio/tts/customization`,
      ttsModel:
        env.QWEN_TTS_MODEL ||
        env.QWEN_VOICE_DESIGN_TARGET_MODEL ||
        "qwen3-tts-vd-2026-01-26",
      ttsVoice: env.QWEN_TTS_VOICE || "",
      ttsEndpoint:
        env.QWEN_TTS_ENDPOINT ||
        `${ttsBaseUrl}/services/aigc/multimodal-generation/generation`,
      imageModel,
      imageFallbackModel:
        env.QWEN_IMAGE_FALLBACK_MODEL ||
        (imageModel === "wan2.7-image-pro" ? "qwen-image-2.0-pro" : "wan2.7-image-pro"),
      imageEndpoint:
        env.QWEN_IMAGE_ENDPOINT ||
        `${imageBaseUrl}/services/aigc/multimodal-generation/generation`,
      videoApiKey:
        env.QWEN_VIDEO_API_KEY ||
        internationalApiKey ||
        env.QWEN_API_KEY ||
        "",
      videoModel: env.QWEN_VIDEO_MODEL || "happyhorse-1.0-i2v",
      videoEndpoint:
        env.QWEN_VIDEO_ENDPOINT ||
        `${videoBaseUrl}/services/aigc/video-generation/video-synthesis`,
      videoTaskBaseUrl: stripTrailingSlash(
        env.QWEN_VIDEO_TASK_BASE_URL || `${videoBaseUrl}/tasks`
      ),
      videoTimeoutMs: Number(env.QWEN_VIDEO_TIMEOUT_MS || 240000),
      timeoutMs: Number(env.QWEN_TIMEOUT_MS || 45000)
    },
    storage: {
      provider:
        env.QUOTEX_STORAGE_PROVIDER === "alibaba"
          ? "alibaba"
          : env.QUOTEX_STORAGE_PROVIDER === "memory"
            ? "memory"
            : "sqlite",
      accessKeyId:
        env.TABLESTORE_ACCESS_KEY_ID ||
        env.OSS_ACCESS_KEY_ID ||
        env.ALIBABA_CLOUD_ACCESS_KEY_ID ||
        "",
      accessKeySecret:
        env.TABLESTORE_ACCESS_KEY_SECRET ||
        env.OSS_ACCESS_KEY_SECRET ||
        env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ||
        "",
      securityToken:
        env.TABLESTORE_SECURITY_TOKEN ||
        env.OSS_STS_TOKEN ||
        env.ALIBABA_CLOUD_SECURITY_TOKEN ||
        "",
      tableStore: {
        instanceName: tableStoreInstance,
        endpoint:
          env.TABLESTORE_ENDPOINT ||
          (tableStoreInstance
            ? `https://${tableStoreInstance}.${storageRegion}.ots.aliyuncs.com`
            : ""),
        listingsTable: env.TABLESTORE_LISTINGS_TABLE || "quotex_listings",
        agentRunsTable: env.TABLESTORE_AGENT_RUNS_TABLE || "quotex_agent_runs",
        autoCreateTables: env.TABLESTORE_AUTO_CREATE_TABLES !== "false"
      },
      oss: {
        region: env.OSS_REGION || `oss-${storageRegion}`,
        bucket: env.OSS_BUCKET || "",
        internal: env.OSS_INTERNAL === "true",
        objectPrefix: cleanObjectPrefix(env.OSS_OBJECT_PREFIX || "quotex"),
        serverSideEncryption:
          env.OSS_SERVER_SIDE_ENCRYPTION === "none" ? "none" : "AES256"
      }
    }
  };
}

export async function loadEnvironment(path = ".env"): Promise<NodeJS.ProcessEnv> {
  const fileEnv = await readDotEnv(path);
  return { ...fileEnv, ...process.env };
}

async function readDotEnv(path: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(path, "utf8");

    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          const key = line.slice(0, index).trim();
          const rawValue = line.slice(index + 1).trim();
          const value = rawValue.replace(/^["']|["']$/g, "");

          return [key, value];
        })
    );
  } catch {
    return {};
  }
}

function buildQwenBaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.QWEN_BASE_URL) return stripTrailingSlash(env.QWEN_BASE_URL);
  if (env.QWEN_API_BASE_URL) return stripTrailingSlash(env.QWEN_API_BASE_URL);
  if (env.DASHSCOPE_BASE_URL) return stripTrailingSlash(env.DASHSCOPE_BASE_URL);

  if (env.QWEN_WORKSPACE_ID) {
    const region = env.QWEN_REGION || "ap-northeast-1";
    return `https://${env.QWEN_WORKSPACE_ID}.${region}.maas.aliyuncs.com/compatible-mode/v1`;
  }

  return DEFAULT_QWEN_BASE_URL;
}

function buildQwenImageBaseUrl(env: NodeJS.ProcessEnv, baseUrl: string): string {
  if (env.QWEN_IMAGE_BASE_URL) return stripTrailingSlash(env.QWEN_IMAGE_BASE_URL);
  if (env.DASHSCOPE_IMAGE_BASE_URL) return stripTrailingSlash(env.DASHSCOPE_IMAGE_BASE_URL);
  if (env.QWEN_DASHSCOPE_URL) return stripTrailingSlash(env.QWEN_DASHSCOPE_URL);

  try {
    const url = new URL(baseUrl);
    if (url.pathname.includes("/api/v1")) {
      return stripTrailingSlash(`${url.origin}/api/v1`);
    }

    return `${url.origin}/api/v1`;
  } catch {
    return "https://dashscope-intl.aliyuncs.com/api/v1";
  }
}

function buildQwenTtsBaseUrl(env: NodeJS.ProcessEnv, baseUrl: string): string {
  if (env.QWEN_TTS_BASE_URL) return stripTrailingSlash(env.QWEN_TTS_BASE_URL);
  if (env.DASHSCOPE_TTS_BASE_URL) return stripTrailingSlash(env.DASHSCOPE_TTS_BASE_URL);

  return buildApiBaseUrl(baseUrl);
}

function buildQwenVideoBaseUrl(env: NodeJS.ProcessEnv, baseUrl: string): string {
  if (env.QWEN_VIDEO_BASE_URL) return stripTrailingSlash(env.QWEN_VIDEO_BASE_URL);
  if (env.DASHSCOPE_VIDEO_BASE_URL) return stripTrailingSlash(env.DASHSCOPE_VIDEO_BASE_URL);

  return buildApiBaseUrl(baseUrl);
}

function buildApiBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}/api/v1`;
  } catch {
    return "https://dashscope-intl.aliyuncs.com/api/v1";
  }
}

function stripTrailingSlash(value: string): string {
  return String(value).replace(/\/+$/, "");
}

function cleanObjectPrefix(value: string): string {
  return String(value)
    .replace(/[^A-Za-z0-9/_-]+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 120) || "quotex";
}
