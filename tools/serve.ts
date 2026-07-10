import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { customers, products } from "../src/data.js";
import { loadConfig } from "../server/config.js";
import { generateMarketingAsset } from "../server/marketing-asset.js";
import { parseRfqWithQwen } from "../server/qwen-parser.js";

const root = resolve(process.cwd());
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const config = await loadConfig();
const MAX_JSON_BODY_BYTES = 7_000_000;

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};
const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)"
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
        const failure = toStatusError(error);
        sendJson(response, failure.status || 502, {
          ok: false,
          error: failure.message || "Marketing asset generation failed",
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
          customers.find((candidate) => candidate.id === payload.rfq?.customerId) ||
          customers[0]!;
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
        const failure = toStatusError(error);
        sendJson(response, 200, {
          ok: false,
          error: failure.message || "Qwen parser failed",
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

    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(403, securityHeaders);
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders,
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, {
      ...securityHeaders,
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end("Not found");
  }
});

// Function Compute custom containers require long-lived keep-alive support.
server.requestTimeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;

server.listen(port, host, () => {
  console.log(`QuoteX running at http://${host}:${port}`);
  console.log(
    `Qwen ${config.qwen.apiKey ? "configured" : "not configured"}: ${config.qwen.model} via ${safeHost(
      config.qwen.baseUrl
    )}`
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function readJsonRequest(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;

    if (totalBytes > MAX_JSON_BODY_BYTES) {
      const error = new Error(
        "Request payload is too large. Upload an image under 5 MB."
      ) as Error & { status: number };
      error.status = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (!chunks.length) return {};

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}

function toStatusError(value: unknown): Error & { status?: number } {
  return value instanceof Error
    ? (value as Error & { status?: number })
    : Object.assign(new Error(String(value)), { status: undefined });
}
