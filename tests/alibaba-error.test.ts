import assert from "node:assert/strict";
import { summarizeAlibabaError } from "../server/alibaba-error.js";

const summary = summarizeAlibabaError({
  code: "AccessDenied",
  message: "AccessDenied: noisy SDK message",
  statusCode: 403,
  requestId: "request-123",
  data: {
    Message: "Access Denied, extra details: check reject",
    AccessDeniedDetail: {
      AuthAction: "ots:ListInstance",
      EncodedDiagnosticMessage: "must-not-be-exposed"
    }
  }
});

assert.deepEqual(summary, {
  code: "AccessDenied",
  message: "Access Denied",
  statusCode: 403,
  requestId: "request-123",
  missingAction: "ots:ListInstance",
  nextStep:
    "Grant the temporary deployment RAM user permission for ots:ListInstance, then retry."
});
assert.equal(JSON.stringify(summary).includes("must-not-be-exposed"), false);

console.log("alibaba-error tests passed");
