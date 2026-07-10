import assert from "node:assert/strict";
import { rfqScenarios } from "../src/data.js";
import {
  approveQuote,
  buildUncatalogedProductCandidate,
  matchProducts,
  parseRfqDeterministically,
  recallMemories,
  runAutopilot
} from "../src/rfq-engine.js";
import { customers, products } from "../src/data.js";

const moriRfq = rfqScenarios.find((rfq) => rfq.id === "mori-repeat-500")!;
const moriCustomer = customers.find((customer) => customer.id === "mori-lighting")!;

assert.equal(parseRfqDeterministically(moriRfq).quantity, 500);
assert.equal(parseRfqDeterministically(moriRfq).language, "Japanese");

const productMatches = matchProducts(moriRfq.rawMessage, products);
assert.equal(productMatches[0].product.sku, "AUR-CTRL-24");
assert.ok(productMatches[0].score > 0.5);

const memoryMatches = recallMemories(moriCustomer, moriRfq.rawMessage);
assert.ok(memoryMatches.some((memory) => memory.type === "shipping_preference"));
assert.ok(memoryMatches.some((memory) => memory.type === "commercial_preference"));

const analysis = await runAutopilot(moriRfq);
assert.equal(analysis.quote.sku, "AUR-CTRL-24");
assert.equal(analysis.shipping.carrier, "DHL Express");
assert.equal(analysis.approval.status, "pending");
assert.ok(analysis.timeline.length >= 5);
assert.ok(analysis.memoryImpact.factsApplied >= 2);
assert.ok(analysis.memoryImpact.goodsSavingsUsd > 0);
assert.ok(analysis.memoryImpact.routingConfidenceLift > 0);
assert.equal(analysis.executionProof.policyChecks, 6);
assert.equal(analysis.executionProof.humanDecisions, 1);
assert.equal(analysis.executionProof.qwenStatus, "Guarded fallback");

const approved = approveQuote(analysis);
assert.equal(approved.approval.status, "approved");
assert.equal(approved.memoryWrite!.type, "approval_outcome");
assert.equal(approved.memoryWrite!.sku, "AUR-CTRL-24");
assert.equal(approved.timeline.at(-1)!.executionType, "memory-write");

const replayRfq = rfqScenarios.find((rfq) => rfq.id === "mori-memory-replay")!;
const replayAnalysis = await runAutopilot(replayRfq, {
  customer: {
    ...moriCustomer,
    memory: [approved.memoryWrite!, ...moriCustomer.memory]
  }
});
assert.equal(replayAnalysis.quote.quantity, 800);
assert.ok(replayAnalysis.relevantMemories.some((memory) => memory.type === "approval_outcome"));
assert.ok(replayAnalysis.quote.discount > analysis.quote.discount);

const realWorldRfq = {
  ...moriRfq,
  id: "real-world-birkin",
  subject: "Birkin product intake",
  rawMessage:
    "Birkin 25 shiny alligator, green color. I want to sell it 250,000$. Brand new condition",
  isCustomDraft: true
};
const realWorldParsed = parseRfqDeterministically(realWorldRfq);
assert.equal(realWorldParsed.quantity, 1);
assert.equal(realWorldParsed.destination, "Needs confirmation");

const uncataloged = buildUncatalogedProductCandidate({
  parsed: realWorldParsed,
  rfq: realWorldRfq
});
assert.equal(uncataloged.product.sku, "CUSTOM-REVIEW");
assert.equal(uncataloged.product.listPriceUsd, 250000);

const realWorldAnalysis = await runAutopilot(realWorldRfq);
assert.equal(realWorldAnalysis.quote.sku, "CUSTOM-REVIEW");
assert.equal(realWorldAnalysis.selectedProduct.isUncataloged, true);
assert.ok(realWorldAnalysis.risks.some((risk) => risk.title === "Manual product review"));
assert.ok(realWorldAnalysis.risks.some((risk) => risk.title === "Inbound sales intent"));

console.log("rfq-engine tests passed");
