const DEFAULT_MODE = "qwen-live";
const DEMO_MODE = "deterministic-demo";

export function getQwenMode() {
  if (!globalThis.localStorage) {
    return DEMO_MODE;
  }

  return globalThis.localStorage.getItem("quotepilot:qwen-mode") || DEFAULT_MODE;
}

export function setQwenMode(mode) {
  if (!globalThis.localStorage) {
    return;
  }

  globalThis.localStorage.setItem("quotepilot:qwen-mode", mode);
}

export async function parseRfqWithQwen(rfq, context = {}) {
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
    const payload = await response.json();

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
      parsed: payload.parsed,
      trace: payload.trace
    };
  } catch (error) {
    return {
      parsed: null,
      trace: {
        status: "error",
        mode,
        error: error.message
      }
    };
  }
}
