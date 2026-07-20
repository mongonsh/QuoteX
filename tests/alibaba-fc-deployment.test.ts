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

console.log("alibaba-fc-deployment tests passed");
