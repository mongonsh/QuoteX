import assert from "node:assert/strict";
import { customers } from "../src/data.js";
import {
  forgetCustomerOutcomes,
  memoryStoreConfig,
  pruneMemoryStore,
  rememberCustomerOutcome,
  withLearnedMemories
} from "../src/memory-store.js";

const customer = customers.find((candidate) => candidate.id === "nordlicht-retail")!;
const outcome = {
  id: "mem-approved-test",
  type: "approval_outcome",
  title: "Accepted MNG-CASH-SCF via DHL Economy Select",
  evidence: "Human approved the commercial offer.",
  confidence: 0.9,
  updatedAt: "2026-07-10"
};

let store = rememberCustomerOutcome({}, customer.id, outcome);
assert.equal(store[customer.id].length, 1);
assert.equal(withLearnedMemories(customer, store).memory[0].id, outcome.id);

store = rememberCustomerOutcome(store, customer.id, outcome);
assert.equal(store[customer.id].length, 1);

const oversized = Array.from({ length: 20 }, (_, index) => ({
  ...outcome,
  id: `mem-${index}`
}));
const bounded = pruneMemoryStore({ [customer.id]: oversized }, Date.parse("2026-07-10"));
assert.equal(bounded[customer.id].length, memoryStoreConfig.maxMemoriesPerCustomer);

const expired = pruneMemoryStore(
  {
    [customer.id]: [{ ...outcome, updatedAt: "2020-01-01" }]
  },
  Date.parse("2026-07-10")
);
assert.equal(expired[customer.id], undefined);

assert.equal(forgetCustomerOutcomes(store, customer.id)[customer.id], undefined);

console.log("memory-store tests passed");
