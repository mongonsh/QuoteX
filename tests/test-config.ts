import type { AppConfig, QwenConfig } from "../src/types.js";

function testCredential(label: string): string {
  return ["quotex", "test", label, String(process.pid)].join(".");
}

export const TEST_CREDENTIALS = Object.freeze({
  apiKey: testCredential("text"),
  agentApiKey: testCredential("agent"),
  imageApiKey: testCredential("image"),
  speechApiKey: testCredential("speech"),
  ttsApiKey: testCredential("tts"),
  videoApiKey: testCredential("video"),
  registryPassword: testCredential("registry"),
  accessToken: testCredential("access")
});

export function createTestConfig(overrides: Partial<QwenConfig> = {}): AppConfig {
  return {
    qwen: {
      apiKey: TEST_CREDENTIALS.apiKey,
      agentApiKey: TEST_CREDENTIALS.agentApiKey,
      agentBaseUrl: "https://example.test/compatible-mode/v1",
      imageApiKey: TEST_CREDENTIALS.imageApiKey,
      speechApiKey: TEST_CREDENTIALS.speechApiKey,
      speechBaseUrl: "https://example.test/compatible-mode/v1",
      ttsApiKey: TEST_CREDENTIALS.ttsApiKey,
      baseUrl: "https://example.test/compatible-mode/v1",
      model: "qwen3.7-plus",
      agentModel: "qwen3.7-plus",
      marketingModel: "qwen3.7-plus",
      visionModel: "qwen3.7-plus",
      speechModel: "qwen3-asr-flash",
      voiceDesignModel: "qwen-voice-design",
      voiceDesignTargetModel: "qwen3-tts-vd-2026-01-26",
      voiceDesignEndpoint: "https://example.test/api/v1/services/audio/tts/customization",
      ttsModel: "qwen3-tts-vd-2026-01-26",
      ttsVoice: "",
      ttsEndpoint: "https://example.test/api/v1/services/aigc/multimodal-generation/generation",
      imageModel: "wan2.7-image-pro",
      imageFallbackModel: "qwen-image-2.0-pro",
      imageEndpoint: "https://example.test/api/v1/services/aigc/multimodal-generation/generation",
      videoApiKey: TEST_CREDENTIALS.videoApiKey,
      videoModel: "happyhorse-1.0-i2v",
      videoEndpoint: "https://example.test/api/v1/services/aigc/video-generation/video-synthesis",
      videoTaskBaseUrl: "https://example.test/api/v1/tasks",
      videoTimeoutMs: 1_000,
      timeoutMs: 1_000,
      ...overrides
    },
    storage: {
      provider: "sqlite",
      accessKeyId: "",
      accessKeySecret: "",
      securityToken: "",
      tableStore: {
        instanceName: "",
        endpoint: "",
        listingsTable: "quotex_listings",
        agentRunsTable: "quotex_agent_runs",
        autoCreateTables: false
      },
      oss: {
        region: "oss-ap-northeast-1",
        bucket: "",
        internal: false,
        objectPrefix: "quotex-test",
        serverSideEncryption: "AES256"
      }
    }
  };
}
