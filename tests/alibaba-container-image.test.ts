import assert from "node:assert/strict";
import {
  buildAlibabaContainerImagePlan,
  serializeAlibabaContainerImagePlan
} from "../server/alibaba-container-image.js";
import { TEST_CREDENTIALS } from "./test-config.js";

const plan = buildAlibabaContainerImagePlan({
  env: {
    ALIBABA_ACR_REGISTRY:
      "https://crpi-example.ap-northeast-1.personal.cr.aliyuncs.com/",
    ALIBABA_ACR_NAMESPACE: "quotex",
    ALIBABA_ACR_REPOSITORY: "agent",
    ALIBABA_ACR_USERNAME: "builder@example.com",
    ALIBABA_ACR_PASSWORD: TEST_CREDENTIALS.registryPassword,
    ALIBABA_ACR_TAG: "judge-ready"
  },
  timestamp: new Date("2026-07-19T10:00:00.000Z")
});

assert.equal(plan.readiness.readyToApply, true);
assert.equal(plan.platform, "linux/amd64");
assert.equal(
  plan.taggedImage,
  "crpi-example.ap-northeast-1.personal.cr.aliyuncs.com/quotex/agent:judge-ready"
);
const serialized = JSON.stringify(serializeAlibabaContainerImagePlan(plan));
assert.equal(serialized.includes(TEST_CREDENTIALS.registryPassword), false);
assert.match(serialized, /passwordConfigured/);

const blocked = buildAlibabaContainerImagePlan({ env: {} });
assert.equal(blocked.readiness.readyToApply, false);
assert.ok(blocked.readiness.blockers.length >= 3);

console.log("alibaba-container-image tests passed");
