import assert from "node:assert/strict";
import { guideSellerIntakeWithQwen } from "../server/seller-intake-agent.js";
import { createTestConfig } from "./test-config.js";

const config = createTestConfig({ timeoutMs: 100 });
const originalFetch = globalThis.fetch;
let requestBody: any = null;
let callCount = 0;

try {
  globalThis.fetch = async (url, options) => {
    callCount += 1;
    requestBody = JSON.parse(String(options?.body));
    assert.equal(String(url), "https://example.test/compatible-mode/v1/chat/completions");

    const content = callCount === 1
      ? {
          reply: "That sounds like a strong listing. What is your full name?",
          confidence: 0.93,
          fields: {
            sellerLocation: "Tokyo, Japan",
            targetMarket: "USA",
            brand: "Hermes",
            model: "Birkin 25",
            category: "bag",
            condition: "like new",
            color: "green",
            material: "Togo leather",
            manufactureYear: 2023,
            askingPriceUsd: 15000,
            desiredSaleDays: 30,
            description: "A green 2023 Hermes Birkin 25 in like-new condition.",
            authenticityNotes: "Original receipt and dust bag are available."
          }
        }
      : {
          reply: "What is the exact shade of green?",
          confidence: 0.97,
          fields: {
            sellerName: "Maya Chen",
            sellerEmail: "MAYA@example.com"
          }
        };

    return new Response(
      JSON.stringify({
        model: "qwen3.7-plus",
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { total_tokens: 240 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const first = await guideSellerIntakeWithQwen({
    config,
    payload: {
      message:
        "I want to sell my green 2023 Hermes Birkin 25 for $15,000 within 30 days. It is in Tokyo and is like new.",
      history: [],
      currentFields: {}
    }
  });

  assert.equal(first.answer.fields.targetMarket, "United States");
  assert.equal(first.answer.fields.category, "Handbag");
  assert.equal(first.answer.fields.condition, "Excellent");
  assert.equal(first.answer.fields.askingPriceUsd, 15000);
  assert.deepEqual(first.answer.missingFields, ["sellerName", "sellerEmail"]);
  assert.equal(first.answer.readyToReview, false);
  assert.equal(first.trace.status, "live-seller-intake");
  assert.equal(requestBody.response_format.type, "json_object");
  assert.equal(requestBody.enable_thinking, false);
  assert.match(requestBody.messages[1].content, /Never invent identity/i);
  assert.doesNotMatch(requestBody.messages[1].content, /sk-agent-test/);

  const second = await guideSellerIntakeWithQwen({
    config,
    payload: {
      message: "My name is Maya Chen and my email is maya@example.com.",
      history: [
        { role: "user", content: "I described my Birkin." },
        { role: "assistant", content: first.answer.reply }
      ],
      currentFields: first.answer.fields
    }
  });

  assert.equal(second.answer.fields.sellerName, "Maya Chen");
  assert.equal(second.answer.fields.sellerEmail, "maya@example.com");
  assert.equal(second.answer.fields.brand, "Hermes");
  assert.deepEqual(second.answer.missingFields, []);
  assert.equal(second.answer.readyToReview, true);
  assert.equal(
    second.answer.reply,
    "Your item details are ready to review. Add a photo and confirm ownership before saving."
  );

  await assert.rejects(
    guideSellerIntakeWithQwen({ config, payload: { message: "" } }),
    /Tell the assistant/
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("seller-intake-agent tests passed");
