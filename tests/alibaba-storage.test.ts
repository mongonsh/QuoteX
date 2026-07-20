import assert from "node:assert/strict";
import {
  AlibabaAgentRunStore,
  AlibabaSellerListingStore,
  type JsonDocument,
  type JsonDocumentGateway,
  type ObjectBlobGateway
} from "../server/alibaba-storage.js";
import type { AgentRunEvidence } from "../src/types.js";

const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

class MemoryDocuments implements JsonDocumentGateway {
  readonly tables = new Map<string, Map<string, JsonDocument>>();
  failNextPut = false;

  async ensureTable(tableName: string, _autoCreate: boolean): Promise<void> {
    if (!this.tables.has(tableName)) this.tables.set(tableName, new Map());
  }

  async put(tableName: string, document: JsonDocument): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("simulated Tablestore failure");
    }
    const table = this.tables.get(tableName);
    if (!table) throw new Error(`Missing test table ${tableName}`);
    table.set(document.id, structuredClone(document));
  }

  async get(tableName: string, id: string): Promise<JsonDocument | null> {
    const document = this.tables.get(tableName)?.get(id);
    return document ? structuredClone(document) : null;
  }

  async list(tableName: string, limit: number): Promise<JsonDocument[]> {
    return [...(this.tables.get(tableName)?.values() || [])]
      .slice(0, limit)
      .map((document) => structuredClone(document));
  }

  async delete(tableName: string, id: string): Promise<boolean> {
    return this.tables.get(tableName)?.delete(id) || false;
  }
}

class MemoryObjects implements ObjectBlobGateway {
  readonly objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();

  async put(key: string, bytes: Uint8Array, mimeType: string): Promise<void> {
    this.objects.set(key, { bytes: new Uint8Array(bytes), mimeType });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const object = this.objects.get(key);
    return object ? new Uint8Array(object.bytes) : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

const documents = new MemoryDocuments();
const objects = new MemoryObjects();
await Promise.all([
  documents.ensureTable("listings", true),
  documents.ensureTable("runs", true)
]);

const listingStore = new AlibabaSellerListingStore(
  documents,
  objects,
  "listings",
  "quotex-test"
);
const listingInput = {
  sellerName: "Maya Chen",
  sellerEmail: "maya@example.com",
  sellerLocation: "Tokyo, Japan",
  targetMarket: "United States",
  brand: "Hermes",
  model: "Birkin 25",
  category: "Handbag",
  condition: "Excellent",
  color: "Vert Vertigo",
  material: "Togo leather",
  manufactureYear: 2023,
  askingPriceUsd: 15_000,
  desiredSaleDays: 30,
  description: "Carried twice and stored in its dust bag.",
  authenticityNotes: "Original receipt is available.",
  ownershipConfirmed: true,
  photo: {
    fileName: "birkin.png",
    mimeType: "image/png",
    sizeBytes: 68,
    dataUrl: pngDataUrl
  }
};

const listing = await listingStore.create(listingInput);
assert.equal(listing.photo.url, `/api/listings/${listing.id}/photo`);
assert.equal((await listingStore.list()).length, 1);
assert.equal(objects.objects.size, 1);
const persistedListing = await documents.get("listings", listing.id);
assert.ok(persistedListing);
assert.equal(JSON.stringify(persistedListing).includes("data:image"), false);

const photo = await listingStore.getPhoto(listing.id);
assert.ok(photo);
assert.equal(photo.photo.mimeType, "image/png");
assert.equal(Buffer.from(photo.bytes).subarray(0, 4).toString("hex"), "89504e47");

documents.failNextPut = true;
await assert.rejects(
  () => listingStore.create({ ...listingInput, sellerEmail: "rollback@example.com" }),
  /simulated Tablestore failure/
);
assert.equal(objects.objects.size, 1, "failed metadata writes must roll back their OSS object");

assert.equal(await listingStore.delete(listing.id), true);
assert.equal(await listingStore.delete(listing.id), false);
assert.equal(objects.objects.size, 0);

const evidence: AgentRunEvidence = {
  runId: "run-alibaba-1",
  auditDigest: "sha256:0123456789abcdefabcd",
  status: "live",
  model: "qwen3.7-plus",
  endpointHost: "example.test",
  startedAt: "2026-07-19T00:00:00.000Z",
  completedAt: "2026-07-19T00:00:01.000Z",
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
const runStore = new AlibabaAgentRunStore(documents, "runs");
const savedRun = await runStore.save(evidence, "Nordlicht - Cashmere repeat order");
assert.equal(savedRun.runId, evidence.runId);
assert.equal(await runStore.count(), 1);
assert.equal((await runStore.list())[0]!.evidence, undefined);
assert.equal((await runStore.get(evidence.runId))!.evidence!.auditDigest, evidence.auditDigest);

console.log("alibaba-storage tests passed");
