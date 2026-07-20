import { createHash } from "node:crypto";
import FC20230330, {
  CreateFunctionInput,
  CreateFunctionRequest,
  CreateTriggerInput,
  CreateTriggerRequest,
  CustomContainerConfig,
  CustomRuntimeConfig,
  GetFunctionRequest,
  InputCodeLocation,
  ListTriggersRequest,
  LogConfig,
  UpdateFunctionInput,
  UpdateFunctionRequest,
  UpdateTriggerInput,
  UpdateTriggerRequest
} from "@alicloud/fc20230330";
import { Config as OpenApiConfig } from "@alicloud/openapi-client";
import { createAlibabaCredential } from "./alibaba-credential.js";
import type { AppConfig, StorageConfig } from "../src/types.js";

export interface AlibabaFcDeploymentPlan {
  api: "FC/2023-03-30 CreateFunction";
  deploymentMode: "custom-container" | "code-package";
  endpoint: string;
  region: string;
  request: CreateFunctionRequest;
  triggerRequest: CreateTriggerRequest;
  secretEnvironmentNames: string[];
  readiness: {
    readyToApply: boolean;
    blockers: string[];
    warnings: string[];
  };
}

export interface AlibabaFcCodePackage {
  base64: string;
}

export interface AlibabaFcDeploymentResult {
  functionAction: "created" | "updated";
  triggerAction: "created" | "updated";
  statusCode: number;
  requestId: string;
  functionName: string;
  functionId: string;
  functionArn: string;
  createdTime: string;
  resolvedImageUri: string;
  triggerName: string;
  triggerId: string;
  publicUrl: string;
}

const SECRET_ENVIRONMENT_NAMES = [
  "QWEN_API_KEY",
  "QWEN_AGENT_API_KEY",
  "QWEN_IMAGE_API_KEY",
  "QWEN_ASR_API_KEY",
  "QWEN_TTS_API_KEY",
  "QWEN_VIDEO_API_KEY",
  "QUOTEX_ACCESS_TOKEN"
] as const;

export function buildAlibabaFcDeploymentPlan({
  appConfig,
  env = process.env,
  codePackage
}: {
  appConfig: AppConfig;
  env?: NodeJS.ProcessEnv;
  codePackage?: AlibabaFcCodePackage;
}): AlibabaFcDeploymentPlan {
  const region = text(env.ALIBABA_FC_REGION) || "ap-northeast-1";
  const endpoint = text(env.ALIBABA_FC_ENDPOINT) || `fcv3.${region}.aliyuncs.com`;
  const functionName = text(env.ALIBABA_FC_FUNCTION_NAME) || "quotex-autopilot";
  const image = text(env.ALIBABA_FC_IMAGE);
  const codeBytes = decodeCodePackage(codePackage);
  const deploymentMode = codeBytes ? "code-package" : "custom-container";
  const logProject = text(env.ALIBABA_SLS_PROJECT);
  const logstore = text(env.ALIBABA_SLS_LOGSTORE);
  const accessToken = text(env.QUOTEX_ACCESS_TOKEN);
  const qwenEnvironment = buildQwenEnvironment(appConfig);
  const storageEnvironment = buildStorageEnvironment(appConfig);
  const environmentVariables: Record<string, string> = {
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "9000",
    QUOTEX_DB_PATH: text(env.ALIBABA_FC_DB_PATH) || "/tmp/quotex.sqlite",
    QUOTEX_ACCESS_TOKEN: accessToken,
    QUOTEX_CORS_ORIGINS:
      text(env.QUOTEX_CORS_ORIGINS) || "https://mongonsh.github.io",
    QWEN_VOICE_CACHE_PATH: "/tmp/qwen-voice-profile.json",
    ...qwenEnvironment,
    ...storageEnvironment
  };
  const customContainerConfig =
    deploymentMode === "custom-container"
      ? new CustomContainerConfig({
          image: image || "<immutable-acr-image>",
          port: 9000,
          accelerationType: "Default"
        })
      : undefined;
  const customRuntimeConfig =
    deploymentMode === "code-package"
      ? new CustomRuntimeConfig({
          command: ["/var/fc/lang/nodejs20/bin/node"],
          args: ["/code/dist/tools/serve.js"],
          port: 9000
        })
      : undefined;
  const logConfig =
    logProject && logstore
      ? new LogConfig({
          project: logProject,
          logstore,
          enableInstanceMetrics: true,
          enableRequestMetrics: true,
          enableLlmMetrics: true,
          logBeginRule: "DefaultRegex"
        })
      : undefined;
  const body = new CreateFunctionInput({
    ...(codePackage?.base64
      ? { code: new InputCodeLocation({ zipFile: codePackage.base64 }) }
      : {}),
    functionName,
    description:
      "QuoteX governed Qwen commerce agent. Qwen plans; verified tools own facts; a human approves.",
    runtime: deploymentMode === "code-package" ? "custom.debian10" : "custom-container",
    handler: "not-used",
    cpu: boundedNumber(env.ALIBABA_FC_CPU, 0.5, 0.25, 16),
    memorySize: boundedInteger(env.ALIBABA_FC_MEMORY_MB, 1024, 512, 32768, 64),
    diskSize: 512,
    timeout: boundedInteger(env.ALIBABA_FC_TIMEOUT_SECONDS, 300, 60, 3600, 1),
    instanceConcurrency: boundedInteger(env.ALIBABA_FC_CONCURRENCY, 1, 1, 100, 1),
    internetAccess: true,
    ...(customContainerConfig ? { customContainerConfig } : {}),
    ...(customRuntimeConfig ? { customRuntimeConfig } : {}),
    environmentVariables,
    ...(text(env.ALIBABA_FC_ROLE_ARN) ? { role: text(env.ALIBABA_FC_ROLE_ARN) } : {}),
    ...(logConfig ? { logConfig } : {})
  });
  const triggerRequest = new CreateTriggerRequest({
    body: new CreateTriggerInput({
      triggerName: text(env.ALIBABA_FC_TRIGGER_NAME) || "quotex-public-http",
      triggerType: "http",
      qualifier: "LATEST",
      description: "Public HTTPS entry point for the QuoteX hackathon demo.",
      triggerConfig: JSON.stringify({
        authType: "anonymous",
        disableURLInternet: false,
        methods: ["GET", "POST", "DELETE", "OPTIONS"]
      })
    })
  });
  const usesAlibabaStorage = appConfig.storage.provider === "alibaba";
  const usesMemoryStorage = appConfig.storage.provider === "memory";
  const blockers = [
    ...(deploymentMode === "custom-container" && !image
      ? ["ALIBABA_FC_IMAGE must point to an immutable Alibaba Container Registry image."]
      : []),
    ...(codePackage && !codeBytes ? ["The Function Compute ZIP package is empty or invalid."] : []),
    ...(codeBytes && codeBytes.length > 100_000_000
      ? ["The Function Compute ZIP package exceeds the 100 MB upload limit."]
      : []),
    ...(deploymentMode === "code-package" && appConfig.storage.provider === "sqlite"
      ? [
          "Code-package deployment requires QUOTEX_STORAGE_PROVIDER=memory or alibaba because the Function Compute Node.js 20 runtime does not provide node:sqlite."
        ]
      : []),
    ...(!appConfig.qwen.agentApiKey ? ["A Qwen agent API key is required."] : []),
    ...(!accessToken
      ? ["QUOTEX_ACCESS_TOKEN is required before exposing paid AI endpoints publicly."]
      : []),
    ...(usesAlibabaStorage && !appConfig.storage.tableStore.instanceName
      ? ["TABLESTORE_INSTANCE_NAME is required for Alibaba persistence."]
      : []),
    ...(usesAlibabaStorage && !appConfig.storage.tableStore.endpoint
      ? ["TABLESTORE_ENDPOINT is required for Alibaba persistence."]
      : []),
    ...(usesAlibabaStorage && !appConfig.storage.oss.bucket
      ? ["OSS_BUCKET is required for Alibaba persistence."]
      : []),
    ...(usesAlibabaStorage && !text(env.ALIBABA_FC_ROLE_ARN)
      ? ["ALIBABA_FC_ROLE_ARN is required so the function receives temporary storage credentials."]
      : []),
    ...(!isValidFunctionName(functionName)
      ? ["ALIBABA_FC_FUNCTION_NAME must be 1-64 characters and use letters, digits, underscores, or hyphens."]
      : [])
  ];
  const warnings = [
    ...(!logConfig
      ? ["Set ALIBABA_SLS_PROJECT and ALIBABA_SLS_LOGSTORE to persist structured invocation logs."]
      : []),
    ...(appConfig.storage.provider === "sqlite" &&
    environmentVariables.QUOTEX_DB_PATH.startsWith("/tmp/")
      ? ["The SQLite path is ephemeral. Mount NAS and set ALIBABA_FC_DB_PATH for durable production data."]
      : []),
    ...(!usesAlibabaStorage
      ? ["Use QUOTEX_STORAGE_PROVIDER=alibaba with Tablestore and OSS for durable cloud data."]
      : []),
    ...(deploymentMode === "code-package"
      ? [
          "The ZIP deployment uses Function Compute's built-in Node.js 20 runtime.",
          ...(usesMemoryStorage
            ? ["Memory storage is intentionally ephemeral and intended only for the public hackathon demo."]
            : [])
        ]
      : [])
  ];

  return {
    api: "FC/2023-03-30 CreateFunction",
    deploymentMode,
    endpoint,
    region,
    request: new CreateFunctionRequest({ body }),
    triggerRequest,
    secretEnvironmentNames: SECRET_ENVIRONMENT_NAMES.filter(
      (name) => Boolean(environmentVariables[name])
    ),
    readiness: {
      readyToApply: blockers.length === 0,
      blockers,
      warnings
    }
  };
}

export async function createAlibabaFcFunction(
  plan: AlibabaFcDeploymentPlan,
  credentials?: Pick<
    StorageConfig,
    "accessKeyId" | "accessKeySecret" | "securityToken"
  >
): Promise<AlibabaFcDeploymentResult> {
  if (!plan.readiness.readyToApply) {
    throw new Error(`Deployment is not ready: ${plan.readiness.blockers.join(" ")}`);
  }

  const credential = createAlibabaCredential(credentials);
  const openApiConfig = new OpenApiConfig({
    credential,
    endpoint: plan.endpoint,
    regionId: plan.region,
    protocol: "https",
    connectTimeout: 30_000,
    readTimeout: 180_000
  });
  const client = new FC20230330.default(openApiConfig);
  const functionName = plan.request.body?.functionName || "";
  const triggerName = plan.triggerRequest.body?.triggerName || "";
  let functionAction: "created" | "updated";
  let functionStatusCode = 0;
  let requestId = "";

  try {
    await client.getFunction(functionName, new GetFunctionRequest({ qualifier: "LATEST" }));
    const response = await client.updateFunction(
      functionName,
      createUpdateFunctionRequest(plan.request)
    );
    functionAction = "updated";
    functionStatusCode = response.statusCode || 0;
    requestId = response.headers?.["x-acs-request-id"] || response.headers?.["x-fc-request-id"] || "";
  } catch (error) {
    if (!isMissingAlibabaResource(error)) throw error;
    const response = await client.createFunction(plan.request);
    functionAction = "created";
    functionStatusCode = response.statusCode || 0;
    requestId = response.headers?.["x-acs-request-id"] || response.headers?.["x-fc-request-id"] || "";
  }

  const body = await waitForFunctionReady(client, functionName);
  const triggerList = await client.listTriggers(
    functionName,
    new ListTriggersRequest({ prefix: triggerName, limit: 100 })
  );
  const existingTrigger = triggerList.body?.triggers?.find(
    (candidate) => candidate.triggerName === triggerName
  );
  let triggerAction: "created" | "updated";
  let trigger;

  if (existingTrigger) {
    const response = await client.updateTrigger(
      functionName,
      triggerName,
      createUpdateTriggerRequest(plan.triggerRequest)
    );
    triggerAction = "updated";
    trigger = response.body;
  } else {
    const response = await client.createTrigger(functionName, plan.triggerRequest);
    triggerAction = "created";
    trigger = response.body;
  }

  return {
    functionAction,
    triggerAction,
    statusCode: functionStatusCode,
    requestId,
    functionName: body?.functionName || "",
    functionId: body?.functionId || "",
    functionArn: body?.functionArn || "",
    createdTime: body?.createdTime || "",
    resolvedImageUri: body?.customContainerConfig?.resolvedImageUri || "",
    triggerName: trigger?.triggerName || "",
    triggerId: trigger?.triggerId || "",
    publicUrl: trigger?.httpTrigger?.urlInternet || ""
  };
}

export function createUpdateFunctionRequest(
  createRequest: CreateFunctionRequest
): UpdateFunctionRequest {
  const body = createRequest.body;
  return new UpdateFunctionRequest({
    body: new UpdateFunctionInput({
      code: body?.code,
      cpu: body?.cpu,
      customContainerConfig: body?.customContainerConfig,
      customRuntimeConfig: body?.customRuntimeConfig,
      description: body?.description,
      diskSize: body?.diskSize,
      environmentVariables: body?.environmentVariables,
      handler: body?.handler,
      instanceConcurrency: body?.instanceConcurrency,
      internetAccess: body?.internetAccess,
      logConfig: body?.logConfig,
      memorySize: body?.memorySize,
      role: body?.role,
      runtime: body?.runtime,
      timeout: body?.timeout
    })
  });
}

export function createUpdateTriggerRequest(
  createRequest: CreateTriggerRequest
): UpdateTriggerRequest {
  return new UpdateTriggerRequest({
    body: new UpdateTriggerInput({
      description: createRequest.body?.description,
      qualifier: createRequest.body?.qualifier,
      triggerConfig: createRequest.body?.triggerConfig
    })
  });
}

export function serializeAlibabaFcPlan(plan: AlibabaFcDeploymentPlan): Record<string, unknown> {
  const body = plan.request.body;
  const codeBytes = decodeCodePackage(
    body?.code?.zipFile ? { base64: body.code.zipFile } : undefined
  );
  const environmentVariables = Object.fromEntries(
    Object.entries(body?.environmentVariables || {}).map(([name, value]) => [
      name,
      SECRET_ENVIRONMENT_NAMES.includes(name as (typeof SECRET_ENVIRONMENT_NAMES)[number])
        ? value
          ? "<redacted:configured>"
          : "<redacted:missing>"
        : value
    ])
  );

  return {
    api: plan.api,
    deploymentMode: plan.deploymentMode,
    endpoint: plan.endpoint,
    region: plan.region,
    request: {
      method: "POST",
      path: "/2023-03-30/functions",
      body: {
        functionName: body?.functionName,
        description: body?.description,
        runtime: body?.runtime,
        handler: body?.handler,
        cpu: body?.cpu,
        memorySize: body?.memorySize,
        diskSize: body?.diskSize,
        timeout: body?.timeout,
        instanceConcurrency: body?.instanceConcurrency,
        internetAccess: body?.internetAccess,
        customContainerConfig: body?.customContainerConfig
          ? {
              image: body.customContainerConfig.image,
              port: body.customContainerConfig.port,
              accelerationType: body.customContainerConfig.accelerationType
            }
          : null,
        customRuntimeConfig: body?.customRuntimeConfig
          ? {
              command: body.customRuntimeConfig.command,
              args: body.customRuntimeConfig.args,
              port: body.customRuntimeConfig.port
            }
          : null,
        codePackage: codeBytes
          ? {
              included: true,
              sizeBytes: codeBytes.length,
              sha256: createHash("sha256").update(codeBytes).digest("hex")
            }
          : null,
        environmentVariables,
        role: body?.role || null,
        logConfig: body?.logConfig
          ? {
              project: body.logConfig.project,
              logstore: body.logConfig.logstore,
              enableInstanceMetrics: body.logConfig.enableInstanceMetrics,
              enableRequestMetrics: body.logConfig.enableRequestMetrics,
              enableLlmMetrics: body.logConfig.enableLlmMetrics
            }
          : null
      }
    },
    trigger: {
      method: "POST",
      path: `/2023-03-30/functions/${body?.functionName || ""}/triggers`,
      body: {
        triggerName: plan.triggerRequest.body?.triggerName,
        triggerType: plan.triggerRequest.body?.triggerType,
        qualifier: plan.triggerRequest.body?.qualifier,
        triggerConfig: parseJsonObject(plan.triggerRequest.body?.triggerConfig)
      }
    },
    credentialSource:
      "Alibaba Cloud default credential chain (environment, config file, or attached RAM role)",
    secretEnvironmentNames: plan.secretEnvironmentNames,
    readiness: plan.readiness
  };
}

function buildQwenEnvironment(config: AppConfig): Record<string, string> {
  return compact({
    QWEN_API_KEY: config.qwen.apiKey,
    QWEN_AGENT_API_KEY: config.qwen.agentApiKey,
    QWEN_AGENT_BASE_URL: config.qwen.agentBaseUrl,
    QWEN_MODEL: config.qwen.model,
    QWEN_AGENT_MODEL: config.qwen.agentModel,
    QWEN_MARKETING_MODEL: config.qwen.marketingModel,
    QWEN_VISION_MODEL: config.qwen.visionModel,
    QWEN_IMAGE_API_KEY: config.qwen.imageApiKey,
    QWEN_IMAGE_ENDPOINT: config.qwen.imageEndpoint,
    QWEN_IMAGE_MODEL: config.qwen.imageModel,
    QWEN_IMAGE_FALLBACK_MODEL: config.qwen.imageFallbackModel,
    QWEN_ASR_API_KEY: config.qwen.speechApiKey,
    QWEN_ASR_BASE_URL: config.qwen.speechBaseUrl,
    QWEN_ASR_MODEL: config.qwen.speechModel,
    QWEN_TTS_API_KEY: config.qwen.ttsApiKey,
    QWEN_TTS_ENDPOINT: config.qwen.ttsEndpoint,
    QWEN_TTS_MODEL: config.qwen.ttsModel,
    QWEN_TTS_VOICE: config.qwen.ttsVoice,
    QWEN_VOICE_DESIGN_MODEL: config.qwen.voiceDesignModel,
    QWEN_VOICE_DESIGN_TARGET_MODEL: config.qwen.voiceDesignTargetModel,
    QWEN_VIDEO_API_KEY: config.qwen.videoApiKey,
    QWEN_VIDEO_ENDPOINT: config.qwen.videoEndpoint,
    QWEN_VIDEO_TASK_BASE_URL: config.qwen.videoTaskBaseUrl,
    QWEN_VIDEO_MODEL: config.qwen.videoModel
  });
}

function buildStorageEnvironment(config: AppConfig): Record<string, string> {
  const storage = config.storage;
  return compact({
    QUOTEX_STORAGE_PROVIDER: storage.provider,
    TABLESTORE_INSTANCE_NAME: storage.tableStore.instanceName,
    TABLESTORE_ENDPOINT: storage.tableStore.endpoint,
    TABLESTORE_LISTINGS_TABLE: storage.tableStore.listingsTable,
    TABLESTORE_AGENT_RUNS_TABLE: storage.tableStore.agentRunsTable,
    TABLESTORE_AUTO_CREATE_TABLES: String(storage.tableStore.autoCreateTables),
    OSS_REGION: storage.oss.region,
    OSS_BUCKET: storage.oss.bucket,
    OSS_INTERNAL: String(storage.oss.internal),
    OSS_OBJECT_PREFIX: storage.oss.objectPrefix,
    OSS_SERVER_SIDE_ENCRYPTION: storage.oss.serverSideEncryption
  });
}

function compact(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim().length > 0));
}

function decodeCodePackage(codePackage: AlibabaFcCodePackage | undefined): Buffer | null {
  if (!codePackage?.base64) return null;

  try {
    const bytes = Buffer.from(codePackage.base64, "base64");
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
}

function isValidFunctionName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(value);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  step: number
): number {
  const parsed = Number(value);
  const bounded = Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
  return Math.round(bounded / step) * step;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function waitForFunctionReady(
  client: InstanceType<typeof FC20230330.default>,
  functionName: string
) {
  for (let attempt = 1; attempt <= 45; attempt += 1) {
    const response = await client.getFunction(
      functionName,
      new GetFunctionRequest({ qualifier: "LATEST" })
    );
    const current = response.body;
    const readiness = classifyAlibabaFcFunctionReadiness(current);

    if (readiness === "ready") {
      return current;
    }
    if (readiness === "failed") {
      throw new Error(
        `Function Compute rejected ${functionName}: ${
          current?.lastUpdateStatusReason ||
          current?.stateReason ||
          current?.lastUpdateStatusReasonCode ||
          current?.stateReasonCode ||
          "unknown deployment failure"
        }`
      );
    }

    await wait(Math.min(1_000 + attempt * 250, 3_000));
  }

  throw new Error(`Function Compute did not make ${functionName} active before timeout.`);
}

export function classifyAlibabaFcFunctionReadiness(
  current:
    | {
        state?: string;
        lastUpdateStatus?: string;
      }
    | undefined
): "ready" | "pending" | "failed" {
  const state = current?.state?.toLowerCase() || "";
  const updateStatus = current?.lastUpdateStatus?.toLowerCase() || "";

  if (state === "failed" || updateStatus === "failed") return "failed";
  if (!state && !updateStatus) return "ready";
  if (state === "active" && (!updateStatus || updateStatus === "succeeded")) return "ready";
  return "pending";
}

function isMissingAlibabaResource(error: unknown): boolean {
  const candidate = error as {
    statusCode?: number;
    code?: string;
    data?: { Code?: string; code?: string };
  };
  const code = `${candidate?.code || candidate?.data?.Code || candidate?.data?.code || ""}`
    .toLowerCase();
  return candidate?.statusCode === 404 || code.includes("notfound") || code.includes("not_found");
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
