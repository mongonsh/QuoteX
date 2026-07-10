import assert from "node:assert/strict";
import { customers, products, rfqScenarios } from "../src/data.js";
import { parseRfqWithQwen } from "../server/qwen-parser.js";

const originalFetch = globalThis.fetch;
let requestBody: { messages: Array<{ content: string }> } | null = null;

globalThis.fetch = async (_url, options) => {
  requestBody = JSON.parse(String(options?.body));

  return new Response(
    JSON.stringify({
      model: "qwen3.6-flash",
      choices: [
        {
          message: {
            content: JSON.stringify({
              quantity: 500,
              destination: "Yokohama warehouse",
              deadlineDays: 7,
              language: "Japanese",
              commercialTerms: "Net 30 requested",
              productHints: ["AUR-CTRL-24"],
              shippingPreference: "DHL if needed",
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
    config: {
      qwen: {
        apiKey: "sk-test",
        imageApiKey: "",
        baseUrl: "https://example.test/compatible-mode/v1",
        model: "qwen3.6-flash",
        marketingModel: "qwen3.6-flash",
        imageModel: "qwen-image-2.0-pro",
        imageEndpoint: "https://example.test/api/v1/image",
        timeoutMs: 100
      }
    },
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
  assert.match(result.trace.prompt!, /prompt-injection/i);
  assert.equal(
    requestBody!.messages.some((message: { content: string }) =>
      String(message.content).includes("sk-test")
    ),
    false
  );

  await assert.rejects(
    parseRfqWithQwen({
      config: {
        qwen: {
          apiKey: "sk-test",
          imageApiKey: "",
          baseUrl: "https://example.test/compatible-mode/v1",
          model: "qwen3.6-flash",
          marketingModel: "qwen3.6-flash",
          imageModel: "qwen-image-2.0-pro",
          imageEndpoint: "https://example.test/api/v1/image",
          timeoutMs: 100
        }
      },
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
