import { randomBytes } from "node:crypto";
import { loadConfig, loadEnvironment } from "../server/config.js";
import { updateDotEnv } from "../server/dotenv-file.js";
import { getDesignedVoiceStatus } from "../server/qwen-tts.js";

const [config, env] = await Promise.all([loadConfig(), loadEnvironment()]);
const updates: Record<string, string> = {};
let accessTokenState = "reused";
let voiceState = "configured";

if (!env.QUOTEX_ACCESS_TOKEN?.trim()) {
  updates.QUOTEX_ACCESS_TOKEN = randomBytes(32).toString("base64url");
  accessTokenState = "generated";
}

if (!env.QWEN_TTS_VOICE?.trim()) {
  const designedVoice = await getDesignedVoiceStatus({ config });
  if (designedVoice.voice) {
    updates.QWEN_TTS_VOICE = designedVoice.voice;
    voiceState = "reused cached design";
  } else {
    voiceState = "will be designed on first request";
  }
}

if (Object.keys(updates).length) {
  await updateDotEnv(".env", updates);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      accessToken: accessTokenState,
      designedVoice: voiceState,
      updatedEnvironmentNames: Object.keys(updates)
    },
    null,
    2
  )
);
