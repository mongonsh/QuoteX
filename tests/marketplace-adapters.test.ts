import assert from "node:assert/strict";
import { buildMarketplaceDrafts } from "../src/marketplace-adapters.js";
import { rfqScenarios } from "../src/data.js";
import { runAutopilot } from "../src/rfq-engine.js";
import type { SellerListing } from "../src/types.js";

const listing: SellerListing = {
  id: "electronics-123",
  sellerName: "Maya Chen",
  sellerEmail: "maya@example.com",
  sellerLocation: "Tokyo, Japan",
  targetMarket: "United States",
  brand: "Sony",
  model: "WH-1000XM5",
  category: "Electronics",
  condition: "Excellent",
  color: "Black",
  material: "Plastic and metal",
  manufactureYear: 2024,
  askingPriceUsd: 220,
  desiredSaleDays: 14,
  description: "Lightly used headphones with original case and charging cable.",
  authenticityNotes: "Receipt and serial number photo available.",
  ownershipConfirmed: true,
  status: "intake",
  photo: { fileName: "sony.jpg", mimeType: "image/jpeg", sizeBytes: 1000, url: "/photo" },
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z"
};

const drafts = buildMarketplaceDrafts({ listing, analysis: null, asset: null });
assert.deepEqual(drafts.map((draft) => draft.id), ["ebay", "amazon", "alibaba"]);
assert.ok(drafts.every((draft) => draft.status === "needs-info"));
assert.ok(drafts.every((draft) => draft.missingFields.length > 0));
assert.ok(drafts[0]!.title.length <= 80);
assert.equal((drafts[1]!.payload.attributes as Record<string, unknown>).condition_type instanceof Array, true);
assert.equal((drafts[2]!.payload.tradeInformation as Record<string, unknown>).minOrderQuantity, 1);
assert.equal(JSON.stringify(drafts).includes("maya@example.com"), false);

const wholesaleAnalysis = await runAutopilot(rfqScenarios[0]!);
const wholesaleDrafts = buildMarketplaceDrafts({
  listing: {
    ...listing,
    id: "catalog-mng-cash-scf",
    targetMarket: "Germany",
    brand: "Mongolian Cashmere",
    model: "Grade-A Scarf",
    category: "Fashion",
    condition: "New or unworn"
  },
  analysis: wholesaleAnalysis,
  asset: null
});
const wholesaleTrade = wholesaleDrafts[2]!.payload.tradeInformation as Record<string, unknown>;
assert.equal(wholesaleTrade.minOrderQuantity, 100);
assert.equal(wholesaleTrade.supplyQuantity, 1600);
assert.equal((wholesaleDrafts[0]!.payload as Record<string, unknown>).availableQuantity, 1600);

console.log("marketplace-adapters tests passed");
