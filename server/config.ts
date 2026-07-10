import { readFile } from "node:fs/promises";
import type { AppConfig } from "../src/types.js";

const DEFAULT_QWEN_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export async function loadConfig(): Promise<AppConfig> {
  const fileEnv = await readDotEnv(".env");
  const env = { ...fileEnv, ...process.env };
  const baseUrl = buildQwenBaseUrl(env);
  const imageBaseUrl = buildQwenImageBaseUrl(env, baseUrl);

  return {
    qwen: {
      apiKey: env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || "",
      imageApiKey:
        env.QWEN_IMAGE_API_KEY ||
        env.QWEN_API_KEY ||
        env.DASHSCOPE_API_KEY ||
        "",
      baseUrl,
      model: env.QWEN_MODEL || "qwen3.6-flash",
      marketingModel: env.QWEN_MARKETING_MODEL || env.QWEN_MODEL || "qwen3.6-flash",
      imageModel: env.QWEN_IMAGE_MODEL || "qwen-image-2.0-pro",
      imageEndpoint:
        env.QWEN_IMAGE_ENDPOINT ||
        `${imageBaseUrl}/services/aigc/multimodal-generation/generation`,
      timeoutMs: Number(env.QWEN_TIMEOUT_MS || 18000)
    }
  };
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

function stripTrailingSlash(value: string): string {
  return String(value).replace(/\/+$/, "");
}
