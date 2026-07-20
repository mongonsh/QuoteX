import { loadConfig } from "../server/config.js";
import { makeProductTestPngDataUrl } from "./product-test-image.js";

const DOC_URL = "https://www.alibabacloud.com/help/en/model-studio/qwen-image-edit-api";
const config = await loadConfig();
const apiKey = config.qwen.imageApiKey || config.qwen.apiKey;
const endpoint = config.qwen.imageEndpoint;
const model = config.qwen.imageModel;

if (!apiKey) {
  console.log(
    JSON.stringify({
      ok: false,
      status: "missing-key",
      model,
      endpointHost: safeHost(endpoint),
      hint: "Set QWEN_IMAGE_API_KEY for the image workspace. If it is the same workspace as text, QWEN_API_KEY is enough."
    })
  );
  process.exitCode = 1;
} else {
  const result = await probeImageEdit();
  console.log(JSON.stringify(result));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function probeImageEdit() {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  image: makeProductTestPngDataUrl()
                },
                {
                  text:
                    "Edit this simple product-color image into a clean studio product hero image. No text, no watermark."
                }
              ]
            }
          ]
        },
        parameters: {
          n: 1,
          negative_prompt: "low resolution, watermark, readable text, distorted product",
          prompt_extend: true,
          watermark: false,
          size: "512*512"
        }
      })
    });
    const body = await response.text();
    const parsed = parseJson(body);
    const message = extractMessage(parsed, body);
    const imageUrl = extractImageUrl(parsed);

    return {
      ok: response.ok && Boolean(imageUrl),
      status: response.status,
      model,
      endpointHost: safeHost(endpoint),
      endpointPath: safePath(endpoint),
      message,
      imageUrl: imageUrl || null,
      requestId: parsed?.request_id || null,
      hint:
        response.ok && imageUrl
          ? "Qwen-Image Edit is working for this endpoint."
          : hintFor(response.status, message)
    };
  } catch (error) {
    return {
      ok: false,
      model,
      endpointHost: safeHost(endpoint),
      endpointPath: safePath(endpoint),
      error: error instanceof Error ? error.message : String(error),
      hint:
        "Could not reach the configured image endpoint. Check QWEN_IMAGE_BASE_URL, network access, and the workspace region."
    };
  }
}

function hintFor(status: number, message: unknown): string {
  const text = String(message || "");

  if (/model not exist|model.*not.*found|no such model/i.test(text)) {
    return [
      "The request reached Model Studio, but this endpoint region does not expose the configured image model.",
      "Alibaba's Qwen-Image Edit docs currently list Singapore and Beijing HTTP endpoints.",
      "Create or switch to an image-capable Singapore/Beijing workspace, then set QWEN_IMAGE_API_KEY and QWEN_IMAGE_BASE_URL.",
      `Docs: ${DOC_URL}`
    ].join(" ");
  }

  if (status === 401 || /invalid.*key|api.?key/i.test(text)) {
    return "The image API key was rejected. Use the API key from the same region as QWEN_IMAGE_BASE_URL.";
  }

  if (status === 403 && /quota|payment|free tier/i.test(text)) {
    return "The model/key pair is recognized, but the Alibaba Cloud account needs quota or billing enabled.";
  }

  if (status === 403) {
    return "The endpoint refused the request. Check the image API key, workspace permissions, and model permissions.";
  }

  if (status === 404) {
    return "The endpoint path was not found. QWEN_IMAGE_BASE_URL should end with /api/v1, not /compatible-mode/v1.";
  }

  return "Check the provider message, image model, endpoint region, and workspace permissions.";
}

function extractImageUrl(data: any): string {
  return (
    data?.output?.choices?.[0]?.message?.content?.find(
      (item: { image?: string }) => item.image
    )?.image || ""
  );
}

function extractMessage(data: any, body: string): string {
  return (
    data?.error?.message ||
    data?.message ||
    data?.code ||
    body.slice(0, 180)
  );
}

function parseJson(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "unknown";
  }
}

function safePath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "unknown";
  }
}
