import { loadConfig } from "../server/config.js";
import type { AppConfig } from "../src/types.js";

const config = await loadConfig();
const endpoints = [
  config.qwen.baseUrl,
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
  "https://dashscope.aliyuncs.com/compatible-mode/v1"
].filter((value, index, values) => value && values.indexOf(value) === index);

if (!config.qwen.apiKey) {
  console.log("QWEN_API_KEY missing");
  process.exitCode = 1;
} else {
  for (const baseUrl of endpoints) {
    const result = await probeEndpoint({ baseUrl, config });
    console.log(JSON.stringify(result));
  }
}

async function probeEndpoint({
  baseUrl,
  config
}: {
  baseUrl: string;
  config: AppConfig;
}): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.qwen.model,
        messages: [
          { role: "system", content: "You are terse." },
          { role: "user", content: "Say OK." }
        ],
        temperature: 0.2,
        max_tokens: 8
      })
    });
    const body = await response.text();
    const message = extractMessage(body);

    return {
      host: new URL(baseUrl).host,
      model: config.qwen.model,
      status: response.status,
      message
    };
  } catch (error) {
    return {
      host: safeHost(baseUrl),
      model: config.qwen.model,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function extractMessage(body: string): string {
  try {
    const json = JSON.parse(body);
    return (
      json.error?.message ||
      json.message ||
      json.choices?.[0]?.message?.content ||
      body.slice(0, 180)
    );
  } catch {
    return body.slice(0, 180);
  }
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}
