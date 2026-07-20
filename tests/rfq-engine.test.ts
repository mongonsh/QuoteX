import assert from "node:assert/strict";
import { rfqScenarios } from "../src/data.js";
import {
  approveQuote,
  buildSellerListingProductCandidate,
  buildUncatalogedProductCandidate,
  matchProducts,
  parseRfqDeterministically,
  recallMemories,
  runAutopilot
} from "../src/rfq-engine.js";
import { customers, products } from "../src/data.js";

const flagshipRfq = rfqScenarios.find((rfq) => rfq.id === "nordlicht-cashmere-500")!;
const flagshipCustomer = customers.find((customer) => customer.id === "nordlicht-retail")!;

assert.equal(parseRfqDeterministically(flagshipRfq).quantity, 500);
assert.equal(parseRfqDeterministically(flagshipRfq).language, "English");
assert.equal(
  parseRfqDeterministically({
    ...flagshipRfq,
    rawMessage: "Please quote 1,500 Mongolian cashmere scarves."
  }).quantity,
  1500
);

const productMatches = matchProducts(flagshipRfq.rawMessage, products);
assert.equal(productMatches[0].product.sku, "MNG-CASH-SCF");
assert.ok(productMatches[0].score > 0.5);

const conditionalRfq = rfqScenarios.find((rfq) => rfq.id === "northstar-ambiguous")!;
const conditionalMatches = matchProducts(conditionalRfq.rawMessage, products);
assert.equal(conditionalMatches[0]!.product.sku, "AUR-CTRL-24");
assert.ok(
  conditionalMatches.find((candidate) => candidate.product.sku === "AUR-DRV-60")!.score <
    conditionalMatches[0]!.score
);
const conditionalAnalysis = await runAutopilot(conditionalRfq);
assert.equal(conditionalAnalysis.quote.sku, "AUR-CTRL-24");
assert.ok(
  conditionalAnalysis.risks.some((risk) =>
    ["Product ambiguity", "Conditional product requirement"].includes(risk.title)
  )
);

const memoryMatches = recallMemories(flagshipCustomer, flagshipRfq.rawMessage);
assert.ok(memoryMatches.some((memory) => memory.type === "shipping_preference"));
assert.ok(memoryMatches.some((memory) => memory.type === "commercial_preference"));

const analysis = await runAutopilot(flagshipRfq);
assert.equal(analysis.quote.sku, "MNG-CASH-SCF");
assert.equal(analysis.shipping.carrier, "DHL Economy Select");
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
assert.equal(approved.memoryWrite!.sku, "MNG-CASH-SCF");
assert.equal(approved.timeline.at(-1)!.executionType, "memory-write");

const replayRfq = rfqScenarios.find((rfq) => rfq.id === "nordlicht-cashmere-replay")!;
const replayAnalysis = await runAutopilot(replayRfq, {
  customer: {
    ...flagshipCustomer,
    memory: [approved.memoryWrite!, ...flagshipCustomer.memory]
  }
});
assert.equal(replayAnalysis.quote.quantity, 800);
assert.ok(replayAnalysis.relevantMemories.some((memory) => memory.type === "approval_outcome"));
assert.ok(replayAnalysis.quote.discount > analysis.quote.discount);

const realWorldRfq = {
  ...flagshipRfq,
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

const sellerListingRfq = {
  ...realWorldRfq,
  id: "listing:test-birkin",
  listingId: "test-birkin",
  customerId: "seller-test",
  source: "seller-listing" as const,
  origin: "Tokyo, Japan",
  destination: "United States marketplace",
  deadlineDays: 30,
  rawMessage:
    "I want to sell 1 item: a 2023 Hermes Birkin 25 in green Togo leather. My asking price is USD 15000."
};
const sellerParsed = parseRfqDeterministically(sellerListingRfq);
const sellerCandidate = buildSellerListingProductCandidate({
  parsed: sellerParsed,
  rfq: sellerListingRfq
});
assert.equal(sellerCandidate.product.sku, "ITEM-TESTBIRK");
assert.equal(sellerCandidate.product.listPriceUsd, 15_000);
assert.doesNotMatch(sellerCandidate.product.name, /^sell\b/i);
assert.equal(sellerCandidate.requiresAuthentication, true);

const structuredSellerCandidate = buildSellerListingProductCandidate({
  parsed: sellerParsed,
  rfq: {
    ...sellerListingRfq,
    subject: "Hermes Birkin 25 · Good"
  }
});
assert.equal(structuredSellerCandidate.product.name, "Hermes Birkin 25");

const sellerAnalysis = await runAutopilot(sellerListingRfq, {
  customer: {
    ...flagshipCustomer,
    id: "seller-test",
    company: "Private seller",
    contact: "Maya Chen",
    market: "United States",
    relationship: "New seller",
    paymentTerms: "Marketplace escrow after authentication",
    memory: []
  }
});
assert.equal(sellerAnalysis.selectedProduct.requiresAuthentication, true);
assert.equal(sellerAnalysis.shipping.route, "Tokyo, Japan -> United States");
assert.ok(sellerAnalysis.risks.some((risk) => risk.title === "Independent product verification required"));
assert.equal(sellerAnalysis.risks.some((risk) => risk.title === "Manual product review"), false);
assert.match(sellerAnalysis.timeline[0]!.title, /seller/i);
assert.match(sellerAnalysis.draftEmail, /private seller intake/i);

console.log("rfq-engine tests passed");
