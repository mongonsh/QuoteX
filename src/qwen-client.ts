import type {
  Customer,
  Product,
  QwenMode,
  QwenParsedRfq,
  QwenTrace,
  RfqScenario
} from "./types.js";

const DEFAULT_MODE: QwenMode = "qwen-live";
const DEMO_MODE = "deterministic-demo";
const MODE_STORAGE_KEY = "quotex:qwen-mode";
const LEGACY_MODE_STORAGE_KEY = "quotepilot:qwen-mode";

export function getQwenMode(): QwenMode {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEMO_MODE;
  }

  try {
    const stored =
      window.localStorage.getItem(MODE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_MODE_STORAGE_KEY);
    return stored === DEMO_MODE ? DEMO_MODE : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function setQwenMode(mode: QwenMode): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Mode remains in memory when browser storage is blocked.
  }
}

interface QwenParseContext {
  customer?: Customer;
  products?: Product[];
}

interface QwenParseResult {
  parsed: QwenParsedRfq | null;
  trace: QwenTrace;
}

interface ParseProxyResponse {
  ok?: boolean;
  parsed?: QwenParsedRfq;
  trace?: QwenTrace;
  error?: string;
}

export async function parseRfqWithQwen(
  rfq: RfqScenario,
  context: QwenParseContext = {}
): Promise<QwenParseResult> {
  const mode = getQwenMode();

  if (mode === DEMO_MODE || !globalThis.fetch || !globalThis.window) {
    return {
      parsed: null,
      trace: {
        status: "skipped",
        mode,
        reason: "Deterministic parser selected."
      }
    };
  }

  try {
    const response = await fetch("/api/parse-rfq", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rfq,
        customer: context.customer,
        products: context.products
      })
    });
    const payload = (await response.json()) as ParseProxyResponse;

    if (!response.ok || !payload.ok) {
      return {
        parsed: null,
        trace: {
          status: "error",
          mode,
          model: payload.trace?.model || "qwen3.6-flash",
          endpointHost: payload.trace?.endpointHost || "unknown",
          error: payload.error || `Qwen proxy returned ${response.status}`
        }
      };
    }

    return {
      parsed: payload.parsed ?? null,
      trace: payload.trace ?? {
        status: "error",
        mode,
        error: "Qwen proxy returned an incomplete response"
      }
    };
  } catch (error) {
    return {
      parsed: null,
      trace: {
        status: "error",
        mode,
        error: error instanceof Error ? error.message : "Unknown Qwen proxy error"
      }
    };
  }
}
