import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { customers, products } from "../src/data.js";
import { loadConfig } from "../server/config.mjs";
import { generateMarketingAsset } from "../server/marketing-asset.mjs";
import { parseRfqWithQwen } from "../server/qwen-parser.mjs";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const config = await loadConfig();
const MAX_JSON_BODY_BYTES = 7_000_000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        qwen: {
          configured: Boolean(config.qwen.apiKey),
          imageConfigured: Boolean(config.qwen.imageApiKey || config.qwen.apiKey),
          model: config.qwen.model,
          marketingModel: config.qwen.marketingModel,
          imageModel: config.qwen.imageModel,
          imageEndpointHost: safeHost(config.qwen.imageEndpoint),
          endpointHost: safeHost(config.qwen.baseUrl)
        }
      });
      return;
    }

    if (url.pathname === "/api/generate-marketing-asset" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const result = await generateMarketingAsset({ config, payload });

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, error.status || 502, {
          ok: false,
          error: error.message || "Marketing asset generation failed",
          trace: {
            status: "error",
            model: config.qwen.marketingModel,
            endpointHost: safeHost(config.qwen.baseUrl)
          }
        });
      }
      return;
    }

    if (url.pathname === "/api/parse-rfq" && request.method === "POST") {
      try {
        const payload = await readJsonRequest(request);
        const customer =
          payload.customer ||
          customers.find((candidate) => candidate.id === payload.rfq?.customerId);
        const result = await parseRfqWithQwen({
          config,
          payload: {
            rfq: payload.rfq,
            customer,
            products: payload.products || products
          }
        });

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 200, {
          ok: false,
          error: error.message || "Qwen parser failed",
          trace: {
            status: "error",
            model: config.qwen.model,
            endpointHost: safeHost(config.qwen.baseUrl)
          }
        });
      }
      return;
    }

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = resolve(join(root, normalize(pathname)));

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`QuotePilot running at http://127.0.0.1:${port}`);
  console.log(
    `Qwen ${config.qwen.apiKey ? "configured" : "not configured"}: ${config.qwen.model} via ${safeHost(
      config.qwen.baseUrl
    )}`
  );
});

async function readJsonRequest(request) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error("Request payload is too large. Upload an image under 5 MB.");
      error.status = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function safeHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}
