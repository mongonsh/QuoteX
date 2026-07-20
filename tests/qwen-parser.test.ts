import assert from "node:assert/strict";
import { customers, products, rfqScenarios } from "../src/data.js";
import { parseRfqWithQwen } from "../server/qwen-parser.js";
import { createTestConfig, TEST_CREDENTIALS } from "./test-config.js";

const originalFetch = globalThis.fetch;
let requestBody: {
  messages: Array<{ content: string }>;
  response_format?: { type?: string };
  enable_thinking?: boolean;
  max_tokens?: number;
} | null = null;

globalThis.fetch = async (_url, options) => {
  requestBody = JSON.parse(String(options?.body));

  return new Response(
    JSON.stringify({
      model: "qwen3.7-plus",
      choices: [
        {
          message: {
            content: JSON.stringify({
              quantity: 500,
              destination: "Berlin distribution center",
              deadlineDays: 21,
              language: "English",
              commercialTerms: "Net 30 requested",
              productHints: ["MNG-CASH-SCF"],
              shippingPreference: "DHL under USD 1,000",
              paymentPreference: "Net 30",
              uncertaintyFlags: [],
              confidence: 0.94
            })
          }
        }
      ],
      usage: { total_tokens: 222 }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

try {
  const result = await parseRfqWithQwen({
    config: createTestConfig({
      imageModel: "qwen-image-2.0-pro",
      imageFallbackModel: "wan2.7-image-pro",
      timeoutMs: 100
    }),
    payload: {
      rfq: rfqScenarios[0]!,
      customer: customers[0]!,
      products
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.parsed!.quantity, 500);
  assert.equal(result.trace.status, "live");
  assert.equal(result.trace.usage!.total_tokens, 222);
  assert.match(requestBody!.messages[0]!.content, /untrusted data/i);
  assert.equal(requestBody!.response_format?.type, "json_object");
  assert.equal(requestBody!.enable_thinking, false);
  assert.equal("max_tokens" in requestBody!, false);
  assert.match(result.trace.prompt!, /prompt-injection/i);
  assert.equal(
    requestBody!.messages.some((message: { content: string }) =>
      String(message.content).includes(TEST_CREDENTIALS.apiKey)
    ),
    false
  );

  const sellerResult = await parseRfqWithQwen({
    config: createTestConfig({ timeoutMs: 100 }),
    payload: {
      rfq: {
        ...rfqScenarios[0]!,
        id: "listing:test",
        listingId: "test",
        source: "seller-listing",
        origin: "Tokyo, Japan",
        subject: "Hermes Birkin 25 seller intake",
        rawMessage: "I want to sell one Hermes Birkin 25 for USD 15000."
      },
      customer: { ...customers[0]!, market: "United States" },
      products: []
    }
  });
  assert.equal(sellerResult.ok, true);
  assert.match(sellerResult.trace.prompt!, /private product seller intake/i);
  assert.match(sellerResult.trace.prompt!, /seller-supplied inventory/i);
  assert.equal(sellerResult.trace.prompt!.includes("AUR-CTRL-24"), false);

  await assert.rejects(
    parseRfqWithQwen({
      config: createTestConfig({ timeoutMs: 100 }),
      payload: {
        rfq: { ...rfqScenarios[0]!, rawMessage: "x".repeat(12_001) },
        customer: customers[0]!,
        products
      }
    }),
    /12,000 character limit/
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("qwen-parser tests passed");
