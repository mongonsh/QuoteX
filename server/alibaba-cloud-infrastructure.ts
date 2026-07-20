import { createRequire } from "node:module";
import RAM20150501, {
  AttachPolicyToRoleRequest,
  CreatePolicyRequest,
  CreateRoleRequest,
  GetPolicyRequest,
  GetRoleRequest,
  ListPoliciesForRoleRequest
} from "@alicloud/ram20150501";
import SLS20201230, {
  CreateLogStoreRequest,
  CreateProjectRequest
} from "@alicloud/sls20201230";
import STS20150401 from "@alicloud/sts20150401";
import Tablestore20201209, {
  CreateInstanceRequest,
  ListInstancesRequest
} from "@alicloud/tablestore20201209";
import { Config as OpenApiConfig } from "@alicloud/openapi-client";
import { createAlibabaCredential } from "./alibaba-credential.js";
import { createAlibabaPersistence } from "./alibaba-storage.js";
import type { AppConfig, StorageConfig } from "../src/types.js";

const require = createRequire(import.meta.url);

export interface AlibabaResourceNames {
  region: string;
  accountId: string;
  tableStoreInstance: string;
  tableStoreEndpoint: string;
  listingsTable: string;
  agentRunsTable: string;
  ossRegion: string;
  ossBucket: string;
  ossObjectPrefix: string;
  slsProject: string;
  slsLogstore: string;
  roleName: string;
  policyName: string;
}

export interface AlibabaProvisioningStep {
  resource: "Tablestore" | "OSS" | "SLS project" | "SLS logstore" | "RAM role" | "RAM policy";
  name: string;
  outcome: "created" | "reused";
}

export interface AlibabaInfrastructureResult {
  accountId: string;
  roleArn: string;
  resources: AlibabaResourceNames;
  steps: AlibabaProvisioningStep[];
  runtimeStorage: StorageConfig;
  environment: Record<string, string>;
}

export function buildAlibabaResourceNames({
  accountId,
  env = process.env
}: {
  accountId: string;
  env?: NodeJS.ProcessEnv;
}): AlibabaResourceNames {
  const region = cleanRegion(env.ALIBABA_FC_REGION || env.TABLESTORE_REGION);
  const accountSuffix = accountId.replace(/\D/g, "").slice(-8) || "demo2026";
  const compactSuffix = accountSuffix.slice(-6);
  const tableStoreInstance =
    cleanTableStoreName(env.TABLESTORE_INSTANCE_NAME) || `quotex${compactSuffix}`;
  const ossObjectPrefix = cleanPrefix(env.OSS_OBJECT_PREFIX || "quotex");

  return {
    region,
    accountId,
    tableStoreInstance,
    tableStoreEndpoint:
      cleanUrl(env.TABLESTORE_ENDPOINT) ||
      `https://${tableStoreInstance}.${region}.ots.aliyuncs.com`,
    listingsTable: cleanTableName(env.TABLESTORE_LISTINGS_TABLE || "quotex_listings"),
    agentRunsTable: cleanTableName(
      env.TABLESTORE_AGENT_RUNS_TABLE || "quotex_agent_runs"
    ),
    ossRegion: env.OSS_REGION?.trim() || `oss-${region}`,
    ossBucket:
      cleanDnsName(env.OSS_BUCKET) ||
      cleanDnsName(`quotex-${accountId}-${region}`).slice(0, 63),
    ossObjectPrefix,
    slsProject:
      cleanDnsName(env.ALIBABA_SLS_PROJECT) ||
      cleanDnsName(`quotex-${accountSuffix}-${region}`).slice(0, 63),
    slsLogstore: cleanLogstoreName(env.ALIBABA_SLS_LOGSTORE || "quotex-runtime"),
    roleName: cleanRoleName(env.ALIBABA_FC_ROLE_NAME || "QuoteXFunctionRole"),
    policyName: cleanPolicyName(
      env.ALIBABA_FC_POLICY_NAME || "QuoteXRuntimeAccess"
    )
  };
}

export function buildRuntimePolicy(names: AlibabaResourceNames): Record<string, unknown> {
  const tableResources = [
    `acs:ots:${names.region}:${names.accountId}:instance/${names.tableStoreInstance}`,
    `acs:ots:${names.region}:${names.accountId}:instance/${names.tableStoreInstance}/table/${names.listingsTable}`,
    `acs:ots:${names.region}:${names.accountId}:instance/${names.tableStoreInstance}/table/${names.agentRunsTable}`
  ];
  const ossObjectResource = `acs:oss:*:${names.accountId}:${names.ossBucket}/${names.ossObjectPrefix}/*`;
  const logResource =
    `acs:log:${names.region}:${names.accountId}:project/${names.slsProject}` +
    `/logstore/${names.slsLogstore}`;

  return {
    Version: "1",
    Statement: [
      {
        Effect: "Allow",
        Action: ["ots:ListTable"],
        Resource: tableResources[0]
      },
      {
        Effect: "Allow",
        Action: [
          "ots:GetRow",
          "ots:GetRange",
          "ots:PutRow",
          "ots:DeleteRow"
        ],
        Resource: tableResources.slice(1)
      },
      {
        Effect: "Allow",
        Action: ["oss:GetObject", "oss:PutObject", "oss:DeleteObject"],
        Resource: ossObjectResource
      },
      {
        Effect: "Allow",
        Action: ["log:GetLogStore", "log:PostLogStoreLogs"],
        Resource: logResource
      }
    ]
  };
}

export async function provisionAlibabaInfrastructure({
  appConfig,
  env = process.env,
  onProgress = () => undefined
}: {
  appConfig: AppConfig;
  env?: NodeJS.ProcessEnv;
  onProgress?: (message: string) => void;
}): Promise<AlibabaInfrastructureResult> {
  const credentials = {
    accessKeyId: appConfig.storage.accessKeyId,
    accessKeySecret: appConfig.storage.accessKeySecret,
    securityToken: appConfig.storage.securityToken
  };
  if (!credentials.accessKeyId || !credentials.accessKeySecret) {
    throw new Error(
      "Alibaba provisioning needs ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET."
    );
  }

  const credential = createAlibabaCredential(credentials);
  const region = cleanRegion(env.ALIBABA_FC_REGION || env.TABLESTORE_REGION);
  const stsClient = new STS20150401.default(
    new OpenApiConfig({
      credential,
      endpoint: "sts.aliyuncs.com",
      regionId: region,
      protocol: "https"
    })
  );
  onProgress("Verifying Alibaba Cloud identity");
  const identity = await stsClient.getCallerIdentity();
  const accountId = identity.body?.accountId || "";
  if (!accountId) throw new Error("Alibaba STS did not return an account ID.");

  const names = buildAlibabaResourceNames({ accountId, env });
  const steps: AlibabaProvisioningStep[] = [];
  const tableStoreClient = new Tablestore20201209.default(
    new OpenApiConfig({
      credential,
      regionId: names.region,
      protocol: "https"
    })
  );
  const ramClient = new RAM20150501.default(
    new OpenApiConfig({
      credential,
      endpoint: "ram.aliyuncs.com",
      regionId: names.region,
      protocol: "https"
    })
  );
  const slsClient = new SLS20201230.default(
    new OpenApiConfig({
      credential,
      endpoint: `${names.region}.log.aliyuncs.com`,
      regionId: names.region,
      protocol: "https"
    })
  );

  onProgress(`Preparing Tablestore instance ${names.tableStoreInstance}`);
  const tableStoreOutcome = await ensureTableStoreInstance(
    tableStoreClient,
    names.tableStoreInstance
  );
  steps.push({
    resource: "Tablestore",
    name: names.tableStoreInstance,
    outcome: tableStoreOutcome
  });
  await waitForTableStore(tableStoreClient, names.tableStoreInstance);

  onProgress(`Preparing private OSS bucket ${names.ossBucket}`);
  const ossOutcome = await ensureOssBucket(names, credentials);
  steps.push({ resource: "OSS", name: names.ossBucket, outcome: ossOutcome });

  const runtimeStorage = storageConfigFor(names, credentials, true);
  onProgress("Creating Tablestore data tables");
  const tablePersistence = await retry(
    () => createAlibabaPersistence(runtimeStorage),
    8,
    2_000
  );
  await tablePersistence.close();

  onProgress(`Preparing SLS project ${names.slsProject}`);
  const projectOutcome = await ensureSlsProject(slsClient, names.slsProject);
  steps.push({
    resource: "SLS project",
    name: names.slsProject,
    outcome: projectOutcome
  });
  const logstoreOutcome = await ensureSlsLogstore(
    slsClient,
    names.slsProject,
    names.slsLogstore
  );
  steps.push({
    resource: "SLS logstore",
    name: names.slsLogstore,
    outcome: logstoreOutcome
  });

  onProgress(`Preparing Function Compute role ${names.roleName}`);
  const role = await ensureRuntimeRole(ramClient, names.roleName);
  steps.push({
    resource: "RAM role",
    name: names.roleName,
    outcome: role.outcome
  });
  const policyOutcome = await ensureRuntimePolicy(ramClient, names);
  steps.push({
    resource: "RAM policy",
    name: names.policyName,
    outcome: policyOutcome
  });
  await ensureRolePolicyAttachment(
    ramClient,
    names.roleName,
    names.policyName,
    "Custom"
  );
  await ensureRolePolicyAttachment(
    ramClient,
    names.roleName,
    "AliyunContainerRegistryReadOnlyAccess",
    "System"
  );

  const finalStorage = storageConfigFor(names, credentials, false);
  return {
    accountId,
    roleArn: role.arn,
    resources: names,
    steps,
    runtimeStorage: finalStorage,
    environment: {
      QUOTEX_STORAGE_PROVIDER: "alibaba",
      TABLESTORE_REGION: names.region,
      TABLESTORE_INSTANCE_NAME: names.tableStoreInstance,
      TABLESTORE_ENDPOINT: names.tableStoreEndpoint,
      TABLESTORE_LISTINGS_TABLE: names.listingsTable,
      TABLESTORE_AGENT_RUNS_TABLE: names.agentRunsTable,
      TABLESTORE_AUTO_CREATE_TABLES: "false",
      OSS_REGION: names.ossRegion,
      OSS_BUCKET: names.ossBucket,
      OSS_INTERNAL: "true",
      OSS_OBJECT_PREFIX: names.ossObjectPrefix,
      OSS_SERVER_SIDE_ENCRYPTION: "AES256",
      ALIBABA_SLS_PROJECT: names.slsProject,
      ALIBABA_SLS_LOGSTORE: names.slsLogstore,
      ALIBABA_FC_ROLE_ARN: role.arn
    }
  };
}

async function ensureTableStoreInstance(
  client: InstanceType<typeof Tablestore20201209.default>,
  instanceName: string
): Promise<"created" | "reused"> {
  const existing = await client.listInstances(
    new ListInstancesRequest({
      instanceNameList: [instanceName],
      maxResults: 20
    })
  );
  if (existing.body?.instances?.some((instance) => instance.instanceName === instanceName)) {
    return "reused";
  }

  await client.createInstance(
    new CreateInstanceRequest({
      instanceName,
      instanceDescription: "QuoteX durable commerce-agent state",
      // Tokyo supports the lower-cost Capacity instance type (HYBRID).
      // QuoteX does not create search indexes or reserve throughput.
      clusterType: "HYBRID",
      networkSourceACL: ["TRUST_PROXY"],
      networkTypeACL: ["INTERNET", "VPC"]
    })
  );
  return "created";
}

async function waitForTableStore(
  client: InstanceType<typeof Tablestore20201209.default>,
  instanceName: string
): Promise<void> {
  await retry(async () => {
    const response = await client.listInstances(
      new ListInstancesRequest({
        instanceNameList: [instanceName],
        maxResults: 20
      })
    );
    const instance = response.body?.instances?.find(
      (candidate) => candidate.instanceName === instanceName
    );
    if (!instance || instance.instanceStatus?.toLowerCase() !== "normal") {
      throw new Error(`Tablestore instance ${instanceName} is not ready yet.`);
    }
  }, 20, 3_000);
}

async function ensureOssBucket(
  names: AlibabaResourceNames,
  credentials: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
  }
): Promise<"created" | "reused"> {
  const OSS = require("ali-oss") as OssConstructor;
  const client = new OSS({
    region: names.ossRegion,
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    ...(credentials.securityToken ? { stsToken: credentials.securityToken } : {}),
    secure: true,
    authorizationV4: true,
    timeout: 30_000
  });

  try {
    await client.getBucketInfo(names.ossBucket);
    await client.putBucketACL(names.ossBucket, "private");
    return "reused";
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }

  await client.putBucket(names.ossBucket, {
    acl: "private",
    storageClass: "Standard",
    dataRedundancyType: "LRS"
  });
  return "created";
}

async function ensureSlsProject(
  client: InstanceType<typeof SLS20201230.default>,
  project: string
): Promise<"created" | "reused"> {
  try {
    await client.getProject(project);
    return "reused";
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }
  await client.createProject(
    new CreateProjectRequest({
      projectName: project,
      description: "QuoteX Function Compute invocation and agent audit logs",
      dataRedundancyType: "LRS",
      recycleBinEnabled: true
    })
  );
  return "created";
}

async function ensureSlsLogstore(
  client: InstanceType<typeof SLS20201230.default>,
  project: string,
  logstore: string
): Promise<"created" | "reused"> {
  try {
    await client.getLogStore(project, logstore);
    return "reused";
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }
  await client.createLogStore(
    project,
    new CreateLogStoreRequest({
      logstoreName: logstore,
      ttl: 30,
      shardCount: 1,
      autoSplit: true,
      maxSplitShard: 4,
      appendMeta: true,
      mode: "standard"
    })
  );
  return "created";
}

async function ensureRuntimeRole(
  client: InstanceType<typeof RAM20150501.default>,
  roleName: string
): Promise<{ outcome: "created" | "reused"; arn: string }> {
  try {
    const existing = await client.getRole(new GetRoleRequest({ roleName }));
    const arn = existing.body?.role?.arn || "";
    if (!arn) throw new Error(`RAM role ${roleName} exists without an ARN.`);
    return { outcome: "reused", arn };
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }

  const created = await client.createRole(
    new CreateRoleRequest({
      roleName,
      description: "Least-privilege runtime role for the QuoteX Function Compute app",
      maxSessionDuration: 3600,
      assumeRolePolicyDocument: JSON.stringify({
        Version: "1",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "fc.aliyuncs.com" },
            Action: "sts:AssumeRole"
          }
        ]
      })
    })
  );
  const arn = created.body?.role?.arn || "";
  if (!arn) throw new Error(`Alibaba RAM did not return an ARN for ${roleName}.`);
  return { outcome: "created", arn };
}

async function ensureRuntimePolicy(
  client: InstanceType<typeof RAM20150501.default>,
  names: AlibabaResourceNames
): Promise<"created" | "reused"> {
  try {
    await client.getPolicy(
      new GetPolicyRequest({
        policyName: names.policyName,
        policyType: "Custom"
      })
    );
    return "reused";
  } catch (error) {
    if (!isMissingResource(error)) throw error;
  }

  await client.createPolicy(
    new CreatePolicyRequest({
      policyName: names.policyName,
      description: "QuoteX access to its Tablestore tables, OSS prefix, and SLS logstore",
      policyDocument: JSON.stringify(buildRuntimePolicy(names))
    })
  );
  return "created";
}

async function ensureRolePolicyAttachment(
  client: InstanceType<typeof RAM20150501.default>,
  roleName: string,
  policyName: string,
  policyType: "Custom" | "System"
): Promise<void> {
  const attached = await client.listPoliciesForRole(
    new ListPoliciesForRoleRequest({ roleName })
  );
  const exists = attached.body?.policies?.policy?.some(
    (policy) =>
      policy.policyName === policyName && policy.policyType === policyType
  );
  if (exists) return;

  await client.attachPolicyToRole(
    new AttachPolicyToRoleRequest({ roleName, policyName, policyType })
  );
}

function storageConfigFor(
  names: AlibabaResourceNames,
  credentials: {
    accessKeyId: string;
    accessKeySecret: string;
    securityToken: string;
  },
  autoCreateTables: boolean
): StorageConfig {
  return {
    provider: "alibaba",
    ...credentials,
    tableStore: {
      instanceName: names.tableStoreInstance,
      endpoint: names.tableStoreEndpoint,
      listingsTable: names.listingsTable,
      agentRunsTable: names.agentRunsTable,
      autoCreateTables
    },
    oss: {
      region: names.ossRegion,
      bucket: names.ossBucket,
      internal: false,
      objectPrefix: names.ossObjectPrefix,
      serverSideEncryption: "AES256"
    }
  };
}

async function retry<T>(
  operation: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
      }
    }
  }
  throw lastError;
}

function isMissingResource(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status = Number(error.statusCode || error.status || 0);
  const code = String(error.code || error.name || "");
  return (
    status === 404 ||
    [
      "EntityNotExist",
      "NoSuchBucket",
      "NoSuchEntity",
      "NoSuchPolicy",
      "ProjectNotExist",
      "LogStoreNotExist",
      "ResourceNotFound"
    ].some((candidate) => code.includes(candidate))
  );
}

function cleanRegion(value: unknown): string {
  const region = String(value || "ap-northeast-1").trim();
  return /^[a-z0-9-]+$/.test(region) ? region : "ap-northeast-1";
}

function cleanTableStoreName(value: unknown): string {
  const name = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  return /^[a-z][a-z0-9-]{2,15}$/.test(name) ? name : "";
}

function cleanDnsName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanTableName(value: unknown): string {
  const name = String(value || "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 255);
  return name || "quotex_data";
}

function cleanLogstoreName(value: unknown): string {
  return cleanDnsName(String(value || "").replace(/_/g, "-")).slice(0, 63);
}

function cleanRoleName(value: unknown): string {
  const name = String(value || "").replace(/[^A-Za-z0-9.-]+/g, "").slice(0, 64);
  return name || "QuoteXFunctionRole";
}

function cleanPolicyName(value: unknown): string {
  const name = String(value || "").replace(/[^A-Za-z0-9-]+/g, "").slice(0, 128);
  return name || "QuoteXRuntimeAccess";
}

function cleanPrefix(value: unknown): string {
  return String(value || "quotex")
    .replace(/[^A-Za-z0-9/_-]+/g, "-")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 120) || "quotex";
}

function cleanUrl(value: unknown): string {
  const url = String(value || "").trim().replace(/\/+$/, "");
  return /^https:\/\//.test(url) ? url : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

interface OssClient {
  getBucketInfo(name: string): Promise<unknown>;
  putBucket(
    name: string,
    options: {
      acl: "private";
      storageClass: "Standard";
      dataRedundancyType: "LRS";
    }
  ): Promise<unknown>;
  putBucketACL(name: string, acl: "private"): Promise<unknown>;
}

type OssConstructor = new (options: Record<string, unknown>) => OssClient;
