import assert from "node:assert/strict";
import { answerCustomerWithQwen } from "../server/customer-agent.js";
import { createTestConfig, TEST_CREDENTIALS } from "./test-config.js";

const config = createTestConfig({ timeoutMs: 100 });

const payload = {
  message: "When would the 500 cashmere scarves arrive?",
  history: [{ role: "assistant", content: "How can I help with your quote?" }],
  context: {
    customer: { company: "Nordlicht Concept Stores GmbH", market: "Germany" },
    rfq: { subject: "500 cashmere scarves", destination: "Berlin" },
    analysis: {
      id: "analysis-1",
      approval: { status: "pending" },
      selectedProduct: {
        product: {
          sku: "MNG-CASH-SCF",
          name: "Grade-A Mongolian Cashmere Scarf",
          certification: ["Mongolian certificate of origin"]
        }
      },
      quote: {
        quantity: 500,
        unitPrice: 30,
        landedTotal: 15_586,
        paymentTerms: "Net 30",
        validityDays: 14,
        grossProfit: 5_000,
        margin: 0.38
      },
      shipping: { carrier: "DHL Economy Select", mode: "Consolidated air", days: 12 }
    }
  }
};

const originalFetch = globalThis.fetch;
let requestBody: any = null;
let requestUrl = "";
let authorization = "";

try {
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestBody = JSON.parse(String(options?.body));
    authorization = new Headers(options?.headers).get("Authorization") || "";
    return new Response(
      JSON.stringify({
        model: "qwen3.7-plus",
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "The current plan uses DHL Economy Select with an estimated twelve-day transit after dispatch. Delivery is not guaranteed until the quote is approved.",
                intent: "delivery",
                confidence: 0.95,
                needsHuman: false,
                suggestedActions: ["What is the total?", "What are the payment terms?"]
              })
            }
          }
        ],
        usage: { total_tokens: 180 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const live = await answerCustomerWithQwen({ config, payload });
  assert.equal(live.answer.intent, "delivery");
  assert.equal(live.trace.status, "live-agent");
  assert.equal(requestUrl, "https://example.test/compatible-mode/v1/chat/completions");
  assert.equal(authorization, `Bearer ${TEST_CREDENTIALS.agentApiKey}`);
  assert.equal(requestBody.response_format.type, "json_object");
  assert.equal(requestBody.enable_thinking, false);
  assert.equal("max_tokens" in requestBody, false);
  assert.match(requestBody.messages[1].content, /pending human approval/);
  assert.doesNotMatch(requestBody.messages[1].content, /grossProfit|"margin"/);

  const visual = await answerCustomerWithQwen({
    config,
    payload: {
      ...payload,
      message: "Does this product photo match the quoted board?",
      attachment: {
        fileName: "aurora-board.png",
        mimeType: "image/png",
        sizeBytes: 68,
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    }
  });
  assert.equal(visual.trace.inputGrounding, "image/png customer attachment (68 B)");
  assert.equal(requestBody.messages[1].content[0].type, "text");
  assert.match(requestBody.messages[1].content[0].text, /aurora-board\.png/);
  assert.equal(requestBody.messages[1].content[1].type, "image_url");
  assert.match(requestBody.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
  assert.doesNotMatch(requestBody.messages[1].content[0].text, /iVBORw0/);

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "quota exhausted" } }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });

  await assert.rejects(
    answerCustomerWithQwen({ config, payload }),
    /quota exhausted/
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("customer-agent tests passed");
