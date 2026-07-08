import { loadConfig } from "../server/config.mjs";

const config = await loadConfig();
const candidates = [
  config.qwen.model,
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-flash",
  "qwen3.5-plus",
  "qwen3.5-flash",
  "qwen3.5-omni-plus",
  "qwen-max",
  "qwen-max-latest",
  "qwen-plus",
  "qwen-turbo",
  "qwen-flash",
  "qwen3-max",
  "qwen3-max-preview",
  "qwen3-coder-plus",
  "qwen3-235b-a22b",
  "qwen3-30b-a3b",
  "qwen3-32b",
  "qwen2.5-max",
  "qwen2.5-72b-instruct"
].filter((value, index, values) => value && values.indexOf(value) === index);

if (!config.qwen.apiKey) {
  console.log("QWEN_API_KEY missing");
  process.exitCode = 1;
} else {
  for (const model of candidates) {
    const result = await probeModel(model);
    console.log(JSON.stringify(result));

    if (result.status === 200) {
      console.log(`USE_MODEL=${model}`);
      break;
    }
  }
}

async function probeModel(model) {
  try {
    const response = await fetch(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say OK." }],
        temperature: 0,
        max_tokens: 4
      })
    });
    const body = await response.text();

    return {
      model,
      status: response.status,
      message: extractMessage(body)
    };
  } catch (error) {
    return {
      model,
      error: error.message
    };
  }
}

function extractMessage(body) {
  try {
    const json = JSON.parse(body);
    return (
      json.error?.message ||
      json.message ||
      json.choices?.[0]?.message?.content ||
      body.slice(0, 160)
    );
  } catch {
    return body.slice(0, 160);
  }
}
