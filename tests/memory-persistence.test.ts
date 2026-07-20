import assert from "node:assert/strict";
import { createPersistence } from "../server/persistence.js";
import type { AgentRunEvidence } from "../src/types.js";
import { createTestConfig } from "./test-config.js";

const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const config = createTestConfig();
config.storage.provider = "memory";

const persistence = await createPersistence({
  config,
  root: process.cwd()
});

try {
  assert.equal(persistence.provider, "memory");
  assert.equal(persistence.durable, false);

  const listing = await persistence.listingStore.create({
    sellerName: "Maya Chen",
    sellerEmail: "maya@example.com",
    sellerLocation: "Tokyo, Japan",
    targetMarket: "United States",
    brand: "Sony",
    model: "Alpha 7 IV",
    category: "Electronics",
    condition: "Excellent",
    color: "Black",
    material: "Magnesium alloy",
    manufactureYear: 2024,
    askingPriceUsd: 1_850,
    desiredSaleDays: 21,
    description: "Low shutter count and complete retail packaging.",
    authenticityNotes: "Serial number and original receipt are available.",
    ownershipConfirmed: true,
    photo: {
      fileName: "camera.png",
      mimeType: "image/png",
      sizeBytes: 68,
      dataUrl: pngDataUrl
    }
  });

  assert.equal((await persistence.listingStore.list()).length, 1);
  assert.equal((await persistence.listingStore.get(listing.id))?.model, "Alpha 7 IV");
  assert.equal((await persistence.listingStore.getPhoto(listing.id))?.photo.mimeType, "image/png");

  const evidence: AgentRunEvidence = {
    runId: "run-memory-1",
    auditDigest: "sha256:memory-persistence-test",
    status: "live",
    model: "qwen3.7-plus",
    endpointHost: "example.test",
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    elapsedMs: 1_000,
    plannerTurns: 1,
    maxPlannerTurns: 4,
    requiredSkills: ["structure_request", "enforce_approval_policy"],
    completedSkills: ["structure_request", "enforce_approval_policy"],
    skillExecutions: [],
    finalSummary: "Ready for seller approval.",
    approvalGate: "human-review-required",
    usage: null
  };

  await persistence.agentRunStore.save(evidence, "Sony camera export listing");
  assert.equal(await persistence.agentRunStore.count(), 1);
  assert.equal(
    (await persistence.agentRunStore.get(evidence.runId))?.evidence?.auditDigest,
    evidence.auditDigest
  );
  assert.equal(await persistence.listingStore.delete(listing.id), true);
} finally {
  await persistence.close();
}

console.log("memory-persistence tests passed");
