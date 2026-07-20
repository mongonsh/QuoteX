import { join } from "node:path";
import { AgentRunStore, type StoredAgentRun } from "./agent-run-store.js";
import { createAlibabaPersistence } from "./alibaba-storage.js";
import { SellerListingStore } from "./listing-store.js";
import type {
  AgentRunEvidence,
  AppConfig,
  SellerListing,
  SellerListingPhoto
} from "../src/types.js";

export type Awaitable<T> = T | Promise<T>;

export interface SellerListingRepository {
  list(): Awaitable<SellerListing[]>;
  get(id: string): Awaitable<SellerListing | null>;
  create(value: unknown): Awaitable<SellerListing>;
  getPhoto(
    id: string
  ): Awaitable<{ photo: SellerListingPhoto; bytes: Uint8Array } | null>;
  delete(id: string): Awaitable<boolean>;
  close(): Awaitable<void>;
}

export interface AgentRunRepository {
  save(evidence: AgentRunEvidence, requestLabel: string): Awaitable<StoredAgentRun>;
  list(limit?: number): Awaitable<StoredAgentRun[]>;
  get(runId: string): Awaitable<StoredAgentRun | null>;
  count(): Awaitable<number>;
  close(): Awaitable<void>;
}

export interface Persistence {
  provider: "sqlite" | "alibaba";
  database: "SQLite" | "Alibaba Tablestore";
  objectStorage: "SQLite BLOB" | "Alibaba OSS";
  durable: boolean;
  listingStore: SellerListingRepository;
  agentRunStore: AgentRunRepository;
  close(): Promise<void>;
}

export async function createPersistence({
  config,
  root,
  databasePath = process.env.QUOTEX_DB_PATH || join(root, ".runtime", "quotex.sqlite")
}: {
  config: AppConfig;
  root: string;
  databasePath?: string;
}): Promise<Persistence> {
  if (config.storage.provider === "alibaba") {
    return createAlibabaPersistence(config.storage);
  }

  const listingStore = new SellerListingStore(databasePath);
  const agentRunStore = new AgentRunStore(databasePath);

  return {
    provider: "sqlite",
    database: "SQLite",
    objectStorage: "SQLite BLOB",
    durable: databasePath !== ":memory:" && !databasePath.startsWith("/tmp/"),
    listingStore,
    agentRunStore,
    async close() {
      await Promise.all([
        Promise.resolve(listingStore.close()),
        Promise.resolve(agentRunStore.close())
      ]);
    }
  };
}
