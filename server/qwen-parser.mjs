const RESPONSE_SCHEMA = {
  quantity: "number | null",
  destination: "string",
  deadlineDays: "number | null",
  language: "string",
  commercialTerms: "string",
  productHints: "string[]",
  shippingPreference: "string",
  paymentPreference: "string",
  uncertaintyFlags: "string[]",
  confidence: "number from 0 to 1"
};

export async function parseRfqWithQwen({ config, payload }) {
  if (!config.qwen.apiKey) {
    return {
      ok: false,
      status: 400,
      error: "QWEN_API_KEY is missing from .env",
      trace: {
        status: "missing-key",
        model: config.qwen.model,
        endpointHost: safeHost(config.qwen.baseUrl)
      }
    };
  }

  const prompt = buildPrompt(payload);
  const startedAt = performance.now();
  const upstream = await callQwen({
    config,
    messages: [
      {
        role: "system",
        content:
          "You are QuotePilot's RFQ parser. Return only valid compact JSON. Do not include markdown, commentary, or code fences."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const content = upstream.choices?.[0]?.message?.content || "";
  const parsed = normalizeParsed(extractJson(content));

  return {
    ok: true,
    parsed,
    trace: {
      status: "live",
      model: upstream.model || config.qwen.model,
      endpointHost: safeHost(config.qwen.baseUrl),
      elapsedMs,
      usage: upstream.usage || null,
      prompt,
      response: parsed,
      rawResponse: content
    }
  };
}

async function callQwen({ config, messages }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.qwen.timeoutMs);

  try {
    const response = await fetch(`${config.qwen.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.qwen.model,
        messages,
        temperature: 0.2,
        top_p: 0.8,
        max_tokens: 900
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data?.error?.message || data?.message || `Qwen returned ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt({ rfq, customer, products }) {
  const catalog = products.map((product) => ({
    sku: product.sku,
    name: product.name,
    aliases: product.aliases,
    stock: product.stock,
    moq: product.moq,
    hsCode: product.hsCode,
    certification: product.certification
  }));
  const memories = (customer?.memory || []).map((memory) => ({
    type: memory.type,
    title: memory.title,
    evidence: memory.evidence
  }));

  return JSON.stringify(
    {
      task:
        "Extract a cross-border RFQ into structured fields for a sales quote workflow.",
      rules: [
        "Use null for unknown numeric fields.",
        "Use productHints for likely SKUs, names, or aliases.",
        "uncertaintyFlags must name ambiguous or risky details.",
        "Do not invent product catalog facts."
      ],
      responseSchema: RESPONSE_SCHEMA,
      customer: {
        company: customer?.company,
        contact: customer?.contact,
        market: customer?.market,
        language: customer?.language,
        memories
      },
      rfq: {
        subject: rfq.subject,
        message: rfq.rawMessage,
        destination: rfq.destination,
        expectedQuantity: rfq.expectedQuantity,
        deadlineDays: rfq.deadlineDays
      },
      catalog
    },
    null,
    2
  );
}

function normalizeParsed(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    quantity: toNullableNumber(source.quantity),
    destination: toStringValue(source.destination),
    deadlineDays: toNullableNumber(source.deadlineDays),
    language: toStringValue(source.language),
    commercialTerms: toStringValue(source.commercialTerms),
    productHints: toStringArray(source.productHints),
    shippingPreference: toStringValue(source.shippingPreference),
    paymentPreference: toStringValue(source.paymentPreference),
    uncertaintyFlags: toStringArray(source.uncertaintyFlags),
    confidence: clampConfidence(source.confidence)
  };
}

function extractJson(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }

    throw new Error("Qwen response did not contain parseable JSON");
  }
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toStringValue(value) {
  return typeof value === "string" ? value : "";
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function safeHost(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "unknown";
  }
}
