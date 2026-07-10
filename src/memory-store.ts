import type { Customer, MemoryRecord, MemoryStore } from "./types.js";

const STORAGE_KEY = "quotex:customer-memory:v1";
const MAX_MEMORIES_PER_CUSTOMER = 12;
const MAX_AGE_DAYS = 365;

export function loadMemoryStore(storage: Storage | undefined = globalThis.localStorage): MemoryStore {
  if (!storage) return {};

  try {
    return pruneMemoryStore(JSON.parse(storage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function saveMemoryStore(
  store: MemoryStore,
  storage: Storage | undefined = globalThis.localStorage
): void {
  if (!storage) return;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(pruneMemoryStore(store)));
  } catch {
    // The app remains usable when storage is unavailable or full.
  }
}

export function rememberCustomerOutcome(
  store: MemoryStore,
  customerId: string,
  memory: MemoryRecord
): MemoryStore {
  if (!customerId || !memory?.id) return pruneMemoryStore(store);

  const current = Array.isArray(store?.[customerId]) ? store[customerId] : [];
  const next = [memory, ...current.filter((item) => item?.id !== memory.id)].slice(
    0,
    MAX_MEMORIES_PER_CUSTOMER
  );

  return pruneMemoryStore({ ...store, [customerId]: next });
}

export function forgetCustomerOutcomes(store: MemoryStore, customerId: string): MemoryStore {
  const next = { ...(store || {}) };
  delete next[customerId];
  return pruneMemoryStore(next);
}

export function withLearnedMemories(customer: Customer, store: MemoryStore): Customer {
  const learned = Array.isArray(store?.[customer.id]) ? store[customer.id] : [];

  return {
    ...customer,
    memory: [...learned, ...(customer.memory || [])]
  };
}

export function pruneMemoryStore(store: unknown, now = Date.now()): MemoryStore {
  if (!store || typeof store !== "object" || Array.isArray(store)) return {};

  const oldestAllowed = now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return Object.fromEntries(
    Object.entries(store as Record<string, unknown>)
      .filter(([customerId, memories]) => customerId && Array.isArray(memories))
      .map(([customerId, memories]) => [
        customerId,
        (memories as unknown[])
          .filter((memory): memory is MemoryRecord => {
            if (!memory || typeof memory !== "object" || !("id" in memory)) return false;
            if (typeof memory.id !== "string" || !memory.id) return false;
            const updatedAt = Date.parse(
              (memory as Partial<MemoryRecord>).updatedAt || ""
            );
            return !Number.isFinite(updatedAt) || updatedAt >= oldestAllowed;
          })
          .slice(0, MAX_MEMORIES_PER_CUSTOMER)
      ])
      .filter(([, memories]) => memories.length > 0)
  );
}

export const memoryStoreConfig = {
  storageKey: STORAGE_KEY,
  maxAgeDays: MAX_AGE_DAYS,
  maxMemoriesPerCustomer: MAX_MEMORIES_PER_CUSTOMER
};
