import assert from "node:assert/strict";
import { customers, products, rfqScenarios } from "../src/data.js";
import { generateMarketingAsset } from "../server/marketing-asset.js";
import { createTestConfig, TEST_CREDENTIALS } from "./test-config.js";

const result = await generateMarketingAsset({
  config: createTestConfig({
    apiKey: "",
    agentApiKey: "",
    imageApiKey: "",
    speechApiKey: "",
    ttsApiKey: "",
    videoApiKey: "",
    imageModel: "qwen-image-2.0-pro",
    imageFallbackModel: "wan2.7-image-pro",
    timeoutMs: 100
  }),
  payload: {
    customer: customers[0],
    product: products[0],
    rfq: rfqScenarios[0],
    quote: {
      quantity: 500,
      landedTotal: 16792,
      paymentTerms: "Net 30"
    },
    media: {
      fileName: "product.png",
      mimeType: "image/png",
      sizeBytes: 68,
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
    }
  }
});

assert.equal(result.ok, true);
assert.equal(result.trace.status, "missing-key");
assert.equal(result.asset.mimeType, "image/svg+xml");
assert.match(result.asset.imageDataUrl, /^data:image\/svg\+xml;base64,/);
assert.equal(result.asset.sourceMedia.fileName, "product.png");
assert.equal(result.asset.visualMode, "local-layout-fallback");
assert.ok(result.asset.brief.headline.length > 0);

const svg = Buffer.from(result.asset.imageDataUrl.split(",")[1], "base64").toString("utf8");
assert.match(svg, /<clipPath id="productClip"><rect x="0" y="0" width="426" height="426" rx="28"\/><\/clipPath>/);
assert.match(svg, /<image href="data:image\/png;base64,/);
assert.match(svg, /Local layout preview/);

const originalFetch = globalThis.fetch;
const imageEditBodies: any[] = [];
let chatBody: any = null;
let chatAuthorization: string | null = null;
let imageAuthorization: string | null = null;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://example.test/qwen-edit.png") {
    return new Response(Uint8Array.from([137, 80, 78, 71]), {
      status: 200,
      headers: { "Content-Type": "image/png" }
    });
  }

  const body = JSON.parse(String(options?.body));
  const authorization = new Headers(options?.headers).get("Authorization");

  if (String(url).includes("/chat/completions")) {
    chatAuthorization = authorization;
    chatBody = body;

    return new Response(
      JSON.stringify({
        model: "qwen3.7-plus",
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: "Export-ready control board",
                subhead: "Quote-ready creative for repeat buyers.",
                badge: "Export ready",
                cta: "Send quote",
                visualPrompt: "Premium product hero image with clean studio lighting.",
                palette: {
                  background: "#f7faf9",
                  accent: "#0f766e",
                  ink: "#17212f"
                },
                complianceNotes: []
              })
            }
          }
        ],
        usage: { total_tokens: 128 }
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  imageEditBodies.push(body);
  imageAuthorization = authorization;

  if (body.model === "wan2.7-image-pro") {
    return new Response(JSON.stringify({ code: "InvalidParameter", message: "Model not exist." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(
    JSON.stringify({
      output: {
        choices: [
          {
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: [{ image: "https://example.test/qwen-edit.png" }]
            }
          }
        ]
      },
      usage: {
        width: 1280,
        height: 720,
        image_count: 1
      },
      request_id: "req-test"
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};

try {
  const liveResult = await generateMarketingAsset({
    config: createTestConfig({
      agentApiKey: TEST_CREDENTIALS.apiKey,
      timeoutMs: 100
    }),
    payload: {
      customer: customers[0],
      product: products[0],
      rfq: rfqScenarios[0],
      quote: {
        quantity: 500,
        landedTotal: 16792,
        paymentTerms: "Net 30"
      },
      media: {
        fileName: "product.png",
        mimeType: "image/png",
        sizeBytes: 68,
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    }
  });

  assert.equal(liveResult.trace.status, "live-image-edit");
  assert.equal(liveResult.asset.visualMode, "qwen-image-edit");
  assert.match(liveResult.asset.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(liveResult.asset.imageUrl, "https://example.test/qwen-edit.png");
  assert.equal(liveResult.trace.assetPersistence, "embedded-data-url");
  assert.deepEqual(liveResult.trace.attemptedModels, ["wan2.7-image-pro", "qwen-image-2.0-pro"]);
  assert.equal(chatAuthorization, `Bearer ${TEST_CREDENTIALS.apiKey}`);
  assert.equal(imageAuthorization, `Bearer ${TEST_CREDENTIALS.imageApiKey}`);
  assert.equal(chatBody.model, "qwen3.7-plus");
  assert.equal(chatBody.response_format.type, "json_object");
  assert.equal(chatBody.enable_thinking, false);
  assert.equal("max_tokens" in chatBody, false);
  assert.equal(chatBody.messages[1].content[0].type, "image_url");
  assert.equal(imageEditBodies[0].model, "wan2.7-image-pro");
  assert.equal(imageEditBodies[0].parameters.negative_prompt, undefined);
  assert.equal(imageEditBodies[1].model, "qwen-image-2.0-pro");
  assert.match(imageEditBodies[1].parameters.negative_prompt, /distorted product/);
  assert.equal(imageEditBodies[1].input.messages[0].content[0].image.startsWith("data:image/png;base64,"), true);
  assert.match(imageEditBodies[1].input.messages[0].content[1].text, /Transform the uploaded product photo/);
} finally {
  globalThis.fetch = originalFetch;
}

let transientImageCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url) === "https://example.test/retried-image.png") {
    return new Response(Uint8Array.from([137, 80, 78, 71]), {
      status: 200,
      headers: { "Content-Type": "image/png" }
    });
  }

  if (String(url).includes("/chat/completions")) {
    return new Response(
      JSON.stringify({
        model: "qwen3.7-plus",
        choices: [
          {
            message: {
              content: JSON.stringify({
                headline: "Cashmere export ready",
                subhead: "Verified wholesale offer for Berlin.",
                badge: "Origin verified",
                cta: "Review offer",
                visualPrompt: "Premium cashmere product photography.",
                palette: {
                  background: "#f5f5f5",
                  accent: "#0f766e",
                  ink: "#17212f"
                },
                complianceNotes: []
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  transientImageCalls += 1;
  if (transientImageCalls === 1) {
    return new Response(
      JSON.stringify({ code: "Throttling", message: "Rate limit temporarily exceeded" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      output: {
        choices: [
          {
            message: {
              content: [{ image: "https://example.test/retried-image.png" }]
            }
          }
        ]
      },
      request_id: "req-retried"
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

try {
  const retriedResult = await generateMarketingAsset({
    config: createTestConfig({
      imageModel: "qwen-image-2.0-pro",
      imageFallbackModel: "qwen-image-2.0-pro",
      timeoutMs: 100
    }),
    payload: {
      customer: customers[0],
      product: products[0],
      rfq: rfqScenarios[0],
      quote: {
        quantity: 500,
        landedTotal: 33630,
        paymentTerms: "Net 30"
      },
      media: {
        fileName: "product.png",
        mimeType: "image/png",
        sizeBytes: 68,
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
      }
    }
  });

  assert.equal(retriedResult.trace.status, "live-image-edit");
  assert.equal(retriedResult.trace.requestId, "req-retried");
  assert.equal(transientImageCalls, 2);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("marketing-asset tests passed");
