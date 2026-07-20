export interface AlibabaContainerImagePlan {
  platform: "linux/amd64";
  containerEngine: string;
  registry: string;
  repositoryUri: string;
  taggedImage: string;
  tag: string;
  username: string;
  passwordConfigured: boolean;
  readiness: {
    readyToApply: boolean;
    blockers: string[];
  };
}

export function buildAlibabaContainerImagePlan({
  env = process.env,
  timestamp = new Date()
}: {
  env?: NodeJS.ProcessEnv;
  timestamp?: Date;
} = {}): AlibabaContainerImagePlan {
  const registry = normalizeRegistry(env.ALIBABA_ACR_REGISTRY);
  const namespace = cleanSegment(env.ALIBABA_ACR_NAMESPACE || "quotex");
  const repository = cleanSegment(env.ALIBABA_ACR_REPOSITORY || "quotex");
  const username = text(env.ALIBABA_ACR_USERNAME);
  const passwordConfigured = Boolean(text(env.ALIBABA_ACR_PASSWORD));
  const tag = cleanTag(env.ALIBABA_ACR_TAG) || timestampTag(timestamp);
  const repositoryUri = [registry, namespace, repository].filter(Boolean).join("/");
  const blockers = [
    ...(!registry ? ["ALIBABA_ACR_REGISTRY is required."] : []),
    ...(!namespace ? ["ALIBABA_ACR_NAMESPACE is required."] : []),
    ...(!repository ? ["ALIBABA_ACR_REPOSITORY is invalid."] : []),
    ...(!username ? ["ALIBABA_ACR_USERNAME is required."] : []),
    ...(!passwordConfigured ? ["ALIBABA_ACR_PASSWORD is required."] : []),
    ...(!isAlibabaRegistry(registry)
      ? ["ALIBABA_ACR_REGISTRY must be an Alibaba Cloud Container Registry host."]
      : [])
  ];

  return {
    platform: "linux/amd64",
    containerEngine: text(env.CONTAINER_ENGINE) || "/opt/podman/bin/podman",
    registry,
    repositoryUri,
    taggedImage: repositoryUri ? `${repositoryUri}:${tag}` : "",
    tag,
    username,
    passwordConfigured,
    readiness: {
      readyToApply: blockers.length === 0,
      blockers
    }
  };
}

export function serializeAlibabaContainerImagePlan(
  plan: AlibabaContainerImagePlan
): Record<string, unknown> {
  return {
    platform: plan.platform,
    containerEngine: plan.containerEngine,
    registry: plan.registry,
    repositoryUri: plan.repositoryUri,
    taggedImage: plan.taggedImage,
    tag: plan.tag,
    usernameConfigured: Boolean(plan.username),
    passwordConfigured: plan.passwordConfigured,
    commands: [
      "<container-engine> build --platform linux/amd64 --format docker --tag <tagged-image> .",
      "<container-engine> login --username <configured-user> --password-stdin <registry>",
      "<container-engine> push --digestfile <private-path> <tagged-image>"
    ],
    readiness: plan.readiness
  };
}

function normalizeRegistry(value: unknown): string {
  return (
    text(value)
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .split("/")[0] || ""
  );
}

function cleanSegment(value: unknown): string {
  const candidate = text(value).toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{1,126}$/.test(candidate) ? candidate : "";
}

function cleanTag(value: unknown): string {
  const candidate = text(value);
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(candidate) ? candidate : "";
}

function timestampTag(timestamp: Date): string {
  return `deploy-${timestamp.toISOString().replace(/\D/g, "").slice(0, 14)}`;
}

function isAlibabaRegistry(registry: string): boolean {
  return !registry || /(?:^|\.)cr\.aliyuncs\.com$/i.test(registry);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
