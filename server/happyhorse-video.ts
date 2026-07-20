import type {
  AppConfig,
  ProductVideoAsset,
  QwenTrace,
  QwenUsage
} from "../src/types.js";

interface VideoPayload {
  media?: {
    dataUrl?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
  prompt?: unknown;
  resolution?: unknown;
  duration?: unknown;
}

interface VideoTaskResponse {
  request_id?: string;
  output?: {
    task_id?: string;
    task_status?: ProductVideoAsset["status"];
    video_url?: string;
    orig_prompt?: string;
    code?: string;
    message?: string;
  };
  usage?: QwenUsage & Record<string, unknown>;
  code?: string;
  message?: string;
}

export interface ProductVideoResult {
  ok: true;
  asset: ProductVideoAsset;
  trace: QwenTrace;
}

const IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i;

export async function submitProductVideo({
  config,
  payload,
  fetchImpl = fetch
}: {
  config: AppConfig;
  payload: VideoPayload;
  fetchImpl?: typeof fetch;
}): Promise<ProductVideoResult> {
  if (!config.qwen.videoApiKey) {
    throw statusError("QWEN_VIDEO_API_KEY, DASHSCOPE_API_KEY, or QWEN_API_KEY is required", 400);
  }

  const media = normalizeMedia(payload.media);
  const prompt = cleanText(payload.prompt, 5_000) ||
    "Subtle premium product motion, slow camera push-in, realistic lighting, preserve the exact product identity and colors, professional B2B campaign style.";
  const resolution = payload.resolution === "1080P" ? "1080P" : "720P";
  const duration = clampInteger(payload.duration, 3, 15, 5);
  const startedAt = performance.now();
  const { response, data } = await fetchJson<VideoTaskResponse>(
    fetchImpl,
    config.qwen.videoEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.videoApiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable"
      },
      body: JSON.stringify({
        model: config.qwen.videoModel,
        input: {
          prompt,
          media: [{ type: "first_frame", url: media.dataUrl }]
        },
        parameters: {
          resolution,
          duration,
          watermark: true
        }
      })
    },
    config.qwen.timeoutMs
  );

  const taskId = data.output?.task_id;
  if (!response.ok || data.code || !taskId) {
    throw statusError(
      data.message || data.output?.message || `HappyHorse returned ${response.status}`,
      response.status || 502
    );
  }

  const status = normalizeStatus(data.output?.task_status);
  return {
    ok: true,
    asset: {
      taskId,
      status,
      model: config.qwen.videoModel,
      prompt,
      resolution,
      duration,
      usage: data.usage || null
    },
    trace: {
      status: "video-task-submitted",
      model: config.qwen.videoModel,
      endpointHost: safeHost(config.qwen.videoEndpoint),
      elapsedMs: Math.round(performance.now() - startedAt),
      requestId: data.request_id || null,
      inputGrounding: `${media.mimeType} first frame (${formatBytes(media.sizeBytes)})`,
      response: { taskId, taskStatus: status, resolution, duration }
    }
  };
}

export async function getProductVideoStatus({
  config,
  taskId,
  prompt = "",
  resolution = "720P",
  duration = 5,
  fetchImpl = fetch
}: {
  config: AppConfig;
  taskId: string;
  prompt?: string;
  resolution?: ProductVideoAsset["resolution"];
  duration?: number;
  fetchImpl?: typeof fetch;
}): Promise<ProductVideoResult> {
  if (!config.qwen.videoApiKey) {
    throw statusError("QWEN_VIDEO_API_KEY, DASHSCOPE_API_KEY, or QWEN_API_KEY is required", 400);
  }
  if (!/^[A-Za-z0-9-]{8,128}$/.test(taskId)) {
    throw statusError("A valid HappyHorse task ID is required", 400);
  }

  const startedAt = performance.now();
  const endpoint = `${config.qwen.videoTaskBaseUrl}/${encodeURIComponent(taskId)}`;
  const { response, data } = await fetchJson<VideoTaskResponse>(
    fetchImpl,
    endpoint,
    {
      headers: { Authorization: `Bearer ${config.qwen.videoApiKey}` }
    },
    config.qwen.timeoutMs
  );

  if (!response.ok || data.code) {
    throw statusError(
      data.message || data.output?.message || `HappyHorse task query returned ${response.status}`,
      response.status || 502
    );
  }

  const status = normalizeStatus(data.output?.task_status);
  const videoUrl = data.output?.video_url;
  const error = status === "FAILED"
    ? data.output?.message || data.output?.code || "HappyHorse video generation failed"
    : undefined;
  if (status === "SUCCEEDED" && !videoUrl) {
    throw statusError("HappyHorse completed without returning a video URL", 502);
  }

  return {
    ok: true,
    asset: {
      taskId,
      status,
      model: config.qwen.videoModel,
      prompt: data.output?.orig_prompt || cleanText(prompt, 5_000),
      resolution,
      duration,
      videoUrl,
      error,
      usage: data.usage || null
    },
    trace: {
      status: status === "SUCCEEDED"
        ? "live-video"
        : status === "FAILED"
          ? "video-failed"
          : "video-processing",
      model: config.qwen.videoModel,
      endpointHost: safeHost(endpoint),
      elapsedMs: Math.round(performance.now() - startedAt),
      usage: data.usage || null,
      requestId: data.request_id || null,
      assetPersistence: videoUrl ? "provider-url" : undefined,
      response: { taskId, taskStatus: status, videoUrl, error }
    }
  };
}

function normalizeMedia(media: VideoPayload["media"]): {
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
} {
  const dataUrl = typeof media?.dataUrl === "string" ? media.dataUrl : "";
  const mimeType = typeof media?.mimeType === "string" ? media.mimeType : "";
  const sizeBytes = Number(media?.sizeBytes || 0);
  if (!IMAGE_DATA_URL_PATTERN.test(dataUrl)) {
    throw statusError("HappyHorse requires a PNG, JPEG, or WebP first-frame image", 400);
  }
  if (Buffer.byteLength(dataUrl, "utf8") > 27_000_000) {
    throw statusError("HappyHorse first frame exceeds the 20 MB image limit", 413);
  }

  return {
    dataUrl,
    mimeType: mimeType.startsWith("image/") ? mimeType : dataUrl.slice(5, dataUrl.indexOf(";")),
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0
  };
}

function normalizeStatus(value: unknown): ProductVideoAsset["status"] {
  if (value === "CANCELED" || value === "UNKNOWN") return "FAILED";
  return value === "RUNNING" || value === "SUCCEEDED" || value === "FAILED"
    ? value
    : "PENDING";
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

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function statusError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
