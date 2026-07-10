import assert from "node:assert/strict";
import { customers, products, rfqScenarios } from "../src/data.js";
import { generateMarketingAsset } from "../server/marketing-asset.js";

const result = await generateMarketingAsset({
  config: {
    qwen: {
      apiKey: "",
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
assert.equal(result.asset.visualMode, "fallback-edited-photo");
assert.ok(result.asset.brief.headline.length > 0);

const svg = Buffer.from(result.asset.imageDataUrl.split(",")[1], "base64").toString("utf8");
assert.match(svg, /<clipPath id="productClip"><rect x="0" y="0" width="426" height="426" rx="28"\/><\/clipPath>/);
assert.match(svg, /<image href="data:image\/png;base64,/);
assert.match(svg, /AI edited preview/);

const originalFetch = globalThis.fetch;
let imageEditBody: any = null;
let chatAuthorization: string | null = null;
let imageAuthorization: string | null = null;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(String(options?.body));
  const authorization = new Headers(options?.headers).get("Authorization");

  if (String(url).includes("/chat/completions")) {
    chatAuthorization = authorization;

    return new Response(
      JSON.stringify({
        model: "qwen3.6-flash",
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

  imageEditBody = body;
  imageAuthorization = authorization;

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
    config: {
      qwen: {
        apiKey: "sk-text-test",
        imageApiKey: "sk-image-test",
        baseUrl: "https://example.test/compatible-mode/v1",
        model: "qwen3.6-flash",
        marketingModel: "qwen3.6-flash",
        imageModel: "qwen-image-2.0-pro",
        imageEndpoint:
          "https://example.test/api/v1/services/aigc/multimodal-generation/generation",
        timeoutMs: 100
      }
    },
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
  assert.equal(liveResult.asset.imageDataUrl, "https://example.test/qwen-edit.png");
  assert.equal(chatAuthorization, "Bearer sk-text-test");
  assert.equal(imageAuthorization, "Bearer sk-image-test");
  assert.equal(imageEditBody.model, "qwen-image-2.0-pro");
  assert.equal(imageEditBody.input.messages[0].content[0].image.startsWith("data:image/png;base64,"), true);
  assert.match(imageEditBody.input.messages[0].content[1].text, /Transform the uploaded product photo/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("marketing-asset tests passed");
