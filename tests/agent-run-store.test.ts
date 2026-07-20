import assert from "node:assert/strict";
import { AgentRunStore } from "../server/agent-run-store.js";
import type { AgentRunEvidence } from "../src/types.js";

const store = new AgentRunStore(":memory:");

try {
  const evidence: AgentRunEvidence = {
    runId: "run-test-1",
    auditDigest: "sha256:0123456789abcdefabcd",
    status: "live",
    model: "qwen3.7-plus",
    endpointHost: "example.test",
    startedAt: "2026-07-14T00:00:00.000Z",
    completedAt: "2026-07-14T00:00:01.000Z",
    elapsedMs: 1000,
    plannerTurns: 2,
    maxPlannerTurns: 4,
    requiredSkills: ["structure_request", "enforce_approval_policy"],
    completedSkills: ["structure_request", "enforce_approval_policy"],
    skillExecutions: [
      {
        id: "1-structure_request",
        toolCallId: "call-1",
        name: "structure_request",
        label: "Structure request",
        status: "succeeded",
        initiatedBy: "qwen",
        elapsedMs: 1,
        inputSummary: "10 extracted fields",
        outputSummary: "500 units structured",
        evidence: ["English input"]
      }
    ],
    finalSummary: "Ready for human review.",
    approvalGate: "human-review-required",
    usage: { total_tokens: 100 }
  };

  const saved = store.save(evidence, "Nordlicht - Cashmere repeat order");
  assert.equal(saved.runId, evidence.runId);
  assert.equal(store.count(), 1);
  assert.equal(store.list()[0]!.requestLabel, "Nordlicht - Cashmere repeat order");
  assert.equal(store.list()[0]!.evidence, undefined);
  assert.equal(store.get(evidence.runId)!.evidence!.auditDigest, evidence.auditDigest);
} finally {
  store.close();
}

console.log("agent-run-store tests passed");
