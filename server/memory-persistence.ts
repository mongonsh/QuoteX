import { randomUUID } from "node:crypto";
import type { StoredAgentRun } from "./agent-run-store.js";
import {
  decodeListingPhoto,
  normalizeSellerListingInput,
  sellerListingPhotoUrl
} from "./listing-store.js";
import type { Persistence } from "./persistence.js";
import type {
  AgentRunEvidence,
  SellerListing,
  SellerListingPhoto
} from "../src/types.js";

const MAX_RETAINED_RUNS = 200;

interface MemoryListing {
  listing: SellerListing;
  bytes: Uint8Array;
}

export function createMemoryPersistence(): Persistence {
  const listings = new Map<string, MemoryListing>();
  const runs = new Map<string, StoredAgentRun>();

  return {
    provider: "memory",
    database: "Memory",
    objectStorage: "Memory",
    durable: false,
    listingStore: {
      list() {
        return [...listings.values()]
          .map(({ listing }) => listing)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      },
      get(id) {
        return listings.get(id)?.listing || null;
      },
      create(value) {
        const input = normalizeSellerListingInput(value);
        const decoded = decodeListingPhoto(input.photo);
        const id = randomUUID();
        const timestamp = new Date().toISOString();
        const listing: SellerListing = {
          ...input,
          id,
          status: "intake",
          photo: {
            fileName: input.photo.fileName,
            mimeType: decoded.mimeType,
            sizeBytes: decoded.bytes.length,
            url: sellerListingPhotoUrl(id)
          },
          createdAt: timestamp,
          updatedAt: timestamp
        };
        listings.set(id, { listing, bytes: decoded.bytes });
        return listing;
      },
      getPhoto(id) {
        const entry = listings.get(id);
        if (!entry) return null;
        const photo: SellerListingPhoto = entry.listing.photo;
        return { photo, bytes: entry.bytes };
      },
      delete(id) {
        return listings.delete(id);
      },
      close() {
        listings.clear();
      }
    },
    agentRunStore: {
      save(evidence, requestLabel) {
        const stored = mapStoredAgentRun(evidence, requestLabel, true);
        runs.delete(evidence.runId);
        runs.set(evidence.runId, stored);
        while (runs.size > MAX_RETAINED_RUNS) {
          const oldest = runs.keys().next().value;
          if (!oldest) break;
          runs.delete(oldest);
        }
        return stored;
      },
      list(limit = 20) {
        const safeLimit = Math.max(1, Math.min(100, Math.round(limit) || 20));
        return [...runs.values()]
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, safeLimit)
          .map(({ evidence: _evidence, ...run }) => run);
      },
      get(runId) {
        return runs.get(runId) || null;
      },
      count() {
        return runs.size;
      },
      close() {
        runs.clear();
      }
    },
    async close() {
      listings.clear();
      runs.clear();
    }
  };
}

function mapStoredAgentRun(
  evidence: AgentRunEvidence,
  requestLabel: string,
  includeEvidence: boolean
): StoredAgentRun {
  const label = String(requestLabel || "Untitled request").replace(/\s+/g, " ").trim();
  return {
    runId: evidence.runId,
    auditDigest: evidence.auditDigest,
    status: evidence.status,
    model: evidence.model,
    requestLabel: label.slice(0, 180) || "Untitled request",
    elapsedMs: evidence.elapsedMs,
    plannerTurns: evidence.plannerTurns,
    toolCalls: evidence.skillExecutions.length,
    completedSkills: evidence.completedSkills.length,
    requiredSkills: evidence.requiredSkills.length,
    approvalGate: evidence.approvalGate,
    createdAt: evidence.completedAt,
    ...(includeEvidence ? { evidence } : {})
  };
}
