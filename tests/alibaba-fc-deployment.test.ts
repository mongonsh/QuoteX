import assert from "node:assert/strict";
import {
  buildAlibabaFcDeploymentPlan,
  createUpdateFunctionRequest,
  createUpdateTriggerRequest,
  serializeAlibabaFcPlan
} from "../server/alibaba-fc-deployment.js";
import { createTestConfig, TEST_CREDENTIALS } from "./test-config.js";

const plan = buildAlibabaFcDeploymentPlan({
  appConfig: createTestConfig(),
  env: {
    ALIBABA_FC_REGION: "ap-northeast-1",
    ALIBABA_FC_FUNCTION_NAME: "quotex-evaluation",
    ALIBABA_FC_IMAGE:
      "registry-vpc.ap-northeast-1.aliyuncs.com/quotex/agent@sha256:1234567890abcdef",
    QUOTEX_ACCESS_TOKEN: TEST_CREDENTIALS.accessToken,
    ALIBABA_SLS_PROJECT: "quotex-observability",
    ALIBABA_SLS_LOGSTORE: "agent-runs"
  }
});

assert.equal(plan.api, "FC/2023-03-30 CreateFunction");
assert.equal(plan.endpoint, "fcv3.ap-northeast-1.aliyuncs.com");
assert.equal(plan.request.body?.runtime, "custom-container");
assert.equal(plan.request.body?.customContainerConfig?.port, 9000);
assert.equal(plan.request.body?.cpu, 0.5);
assert.equal(plan.request.body?.memorySize, 1024);
assert.equal(plan.request.body?.instanceConcurrency, 1);
assert.equal(plan.request.body?.logConfig?.enableLlmMetrics, true);
assert.equal(
  plan.request.body?.environmentVariables?.QUOTEX_ACCESS_TOKEN,
  TEST_CREDENTIALS.accessToken
);
assert.equal(plan.readiness.readyToApply, true);

const serialized = JSON.stringify(serializeAlibabaFcPlan(plan));
assert.match(serialized, /POST/);
assert.match(serialized, /\/2023-03-30\/functions/);
assert.match(serialized, /<redacted:configured>/);
assert.equal(serialized.includes(TEST_CREDENTIALS.agentApiKey), false);
assert.equal(serialized.includes(TEST_CREDENTIALS.imageApiKey), false);
assert.equal(serialized.includes(TEST_CREDENTIALS.accessToken), false);

const updateFunction = createUpdateFunctionRequest(plan.request);
assert.equal(updateFunction.body?.customContainerConfig?.port, 9000);
assert.equal(
  updateFunction.body?.environmentVariables?.QUOTEX_ACCESS_TOKEN,
  TEST_CREDENTIALS.accessToken
);
assert.equal(updateFunction.body?.runtime, "custom-container");

const updateTrigger = createUpdateTriggerRequest(plan.triggerRequest);
assert.equal(updateTrigger.body?.qualifier, "LATEST");
assert.match(updateTrigger.body?.triggerConfig || "", /anonymous/);

const blocked = buildAlibabaFcDeploymentPlan({
  appConfig: createTestConfig({ agentApiKey: "" }),
  env: {}
});
assert.equal(blocked.readiness.readyToApply, false);
assert.ok(blocked.readiness.blockers.length >= 2);

const codePackageBytes = Buffer.from("QuoteX FC ZIP fixture");
const codePackageConfig = createTestConfig();
codePackageConfig.storage.provider = "memory";
const codePackagePlan = buildAlibabaFcDeploymentPlan({
  appConfig: codePackageConfig,
  env: {
    ALIBABA_FC_REGION: "ap-northeast-1",
    ALIBABA_FC_FUNCTION_NAME: "quotex-code-package",
    QUOTEX_ACCESS_TOKEN: TEST_CREDENTIALS.accessToken
  },
  codePackage: { base64: codePackageBytes.toString("base64") }
});
assert.equal(codePackagePlan.deploymentMode, "code-package");
assert.equal(codePackagePlan.request.body?.runtime, "custom.debian10");
assert.equal(codePackagePlan.request.body?.customContainerConfig, undefined);
assert.equal(codePackagePlan.request.body?.customRuntimeConfig?.port, 9000);
assert.equal(
  codePackagePlan.request.body?.customRuntimeConfig?.command?.[0],
  "/var/fc/lang/nodejs20/bin/node"
);
assert.equal(codePackagePlan.readiness.readyToApply, true);
assert.match(codePackagePlan.readiness.warnings.join(" "), /intentionally ephemeral/);

const unsupportedSqlitePlan = buildAlibabaFcDeploymentPlan({
  appConfig: createTestConfig(),
  env: {
    ALIBABA_FC_FUNCTION_NAME: "quotex-code-package",
    QUOTEX_ACCESS_TOKEN: TEST_CREDENTIALS.accessToken
  },
  codePackage: { base64: codePackageBytes.toString("base64") }
});
assert.equal(unsupportedSqlitePlan.readiness.readyToApply, false);
assert.match(unsupportedSqlitePlan.readiness.blockers.join(" "), /node:sqlite/);

const serializedCodePlan = JSON.stringify(serializeAlibabaFcPlan(codePackagePlan));
assert.equal(
  serializedCodePlan.includes(codePackagePlan.request.body?.code?.zipFile || ""),
  false
);
assert.match(serializedCodePlan, /code-package/);
assert.match(serializedCodePlan, /sha256/);

const updateCodeFunction = createUpdateFunctionRequest(codePackagePlan.request);
assert.equal(
  updateCodeFunction.body?.code?.zipFile,
  codePackagePlan.request.body?.code?.zipFile
);
assert.equal(updateCodeFunction.body?.customRuntimeConfig?.port, 9000);

console.log("alibaba-fc-deployment tests passed");
