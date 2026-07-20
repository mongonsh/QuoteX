import assert from "node:assert/strict";
import {
  buildAlibabaResourceNames,
  buildRuntimePolicy
} from "../server/alibaba-cloud-infrastructure.js";

const names = buildAlibabaResourceNames({
  accountId: "1234567890123456",
  env: {
    ALIBABA_FC_REGION: "ap-northeast-1",
    OSS_OBJECT_PREFIX: "quotex/private-assets"
  }
});

assert.equal(names.region, "ap-northeast-1");
assert.equal(names.tableStoreInstance, "quotex123456");
assert.equal(
  names.tableStoreEndpoint,
  "https://quotex123456.ap-northeast-1.ots.aliyuncs.com"
);
assert.equal(names.ossBucket, "quotex-1234567890123456-ap-northeast-1");
assert.equal(names.slsProject, "quotex-90123456-ap-northeast-1");

const policy = JSON.stringify(buildRuntimePolicy(names));
assert.match(policy, /ots:GetRow/);
assert.match(policy, /oss:PutObject/);
assert.match(policy, /log:PostLogStoreLogs/);
assert.equal(policy.includes("quotex/private-assets/*"), true);
assert.equal(policy.includes('"Action":"*"'), false);
assert.equal(policy.includes('"Resource":"*"'), false);
assert.equal(policy.includes("accessKey"), false);

console.log("alibaba-cloud-infrastructure tests passed");
