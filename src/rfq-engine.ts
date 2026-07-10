import { customers, pricingRules, products, shippingOptions } from "./data.js";
import { parseRfqWithQwen } from "./qwen-client.js";
import type {
  Analysis,
  Customer,
  ExecutionProof,
  MemoryImpact,
  MemoryRecord,
  ParsedRfq,
  Product,
  ProductCandidate,
  Quote,
  QuoteRisk,
  QwenParsedRfq,
  QwenTrace,
  RfqScenario,
  ScoredShippingOption,
  TimelineStep
} from "./types.js";

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

export function formatUsd(value: number): string {
  return CURRENCY.format(value);
}

export async function runAutopilot(
  rfq: RfqScenario,
  context: { customer?: Customer } = {}
): Promise<Analysis> {
  const customer = context.customer || findById(customers, rfq.customerId);
  const deterministicParsed = parseRfqDeterministically(rfq);
  const qwenResult = await parseRfqWithQwen(rfq, { customer, products }).catch(() => null);
  const parsed = mergeParsedRfq(deterministicParsed, qwenResult?.parsed);
  const matchedCandidates = matchProducts(
    `${rfq.rawMessage} ${(parsed.productHints || []).join(" ")}`,
    products
  );
  const productCandidates = matchedCandidates.length
    ? matchedCandidates
    : [buildUncatalogedProductCandidate({ parsed, rfq })];
  const selectedProduct = productCandidates[0]!;
  const relevantMemories = recallMemories(customer, rfq.rawMessage);
  const shipping = chooseShipping(customer, rfq, relevantMemories);
  const quote = priceQuote({
    customer,
    product: selectedProduct.product,
    quantity: parsed.quantity,
    shipping,
    memories: relevantMemories
  });
  const risks = assessRisks({
    customer,
    parsed,
    productCandidates,
    quote,
    rfq,
    selectedProduct
  });
  const timeline = buildTimeline({
    customer,
    parsed,
    productCandidates,
    qwenTrace: qwenResult?.trace || null,
    quote,
    relevantMemories,
    risks,
    shipping
  });
  const memoryImpact = measureMemoryImpact({
    customer,
    memories: relevantMemories,
    product: selectedProduct.product,
    quantity: parsed.quantity,
    rfq,
    shipping,
    quote
  });
  const executionProof = buildExecutionProof({
    qwenTrace: qwenResult?.trace,
    relevantMemories,
    risks,
    timeline
  });

  return {
    id: `analysis-${rfq.id}`,
    rfq,
    customer,
    parsed,
    productCandidates,
    selectedProduct,
    relevantMemories,
    memoryImpact,
    shipping,
    quote,
    risks,
    timeline,
    executionProof,
    qwenTrace: qwenResult?.trace || {
      status: "skipped",
      reason: "Qwen parser did not run."
    },
    approval: {
      required: true,
      status: "pending",
      reason: risks.length
        ? "Human approval required because the agent found quote risks."
        : "Human approval required before sending a commercial offer."
    },
    draftEmail: buildDraftEmail({ customer, parsed, quote, risks, shipping })
  };
}

export function approveQuote(analysis: Analysis): Analysis {
  const memoryWrite = buildMemoryWrite(analysis);

  return {
    ...analysis,
    approval: {
      ...analysis.approval,
      status: "approved",
      approvedAt: new Date().toISOString()
    },
    memoryWrite,
    timeline: [
      ...analysis.timeline,
      {
        id: "memory-write",
        role: "Memory Agent",
        title: "Stored outcome for future quotes",
        confidence: 0.9,
        summary: memoryWrite.title,
        evidence: [memoryWrite.evidence],
        toolReads: ["approval_event", "persistent_memory_store"],
        executionType: "memory-write"
      }
    ]
  };
}

export function measureMemoryImpact({
  customer,
  memories,
  product,
  quantity,
  rfq,
  shipping,
  quote
}: {
  customer: Customer;
  memories: MemoryRecord[];
  product: Product;
  quantity: number;
  rfq: RfqScenario;
  shipping: ScoredShippingOption;
  quote: Quote;
}): MemoryImpact {
  const baselineShipping = chooseShipping(customer, rfq, []);
  const baselineQuote = priceQuote({
    customer,
    product,
    quantity,
    shipping: baselineShipping,
    memories: []
  });
  const goodsSavingsUsd = Math.max(0, roundMoney(baselineQuote.goodsTotal - quote.goodsTotal));
  const routingConfidenceLift = Math.max(
    0,
    Math.round((shipping.score - (baselineShipping.score || 0)) * 100)
  );

  return {
    factsApplied: memories.length,
    goodsSavingsUsd,
    routingConfidenceLift,
    selectedCarrier: shipping.carrier,
    baselineCarrier: baselineShipping.carrier,
    changedCarrier: shipping.id !== baselineShipping.id,
    summary:
      memories.length === 0
        ? "No customer memory changed this decision."
        : `${memories.length} remembered fact${memories.length === 1 ? "" : "s"} influenced pricing or fulfillment.`
  };
}

export function buildExecutionProof({
  qwenTrace,
  relevantMemories,
  risks,
  timeline
}: {
  qwenTrace?: QwenTrace;
  relevantMemories: MemoryRecord[];
  risks: QuoteRisk[];
  timeline: TimelineStep[];
}): ExecutionProof {
  const qwenLive = qwenTrace?.status === "live";

  return {
    auditId: `QX-${Date.now().toString(36).toUpperCase()}`,
    qwenStatus: qwenLive ? "Live Qwen Cloud" : "Guarded fallback",
    qwenCalls: qwenLive ? 1 : 0,
    autonomousStages: Math.max(0, timeline.length - 1),
    deterministicToolStages: 3,
    policyChecks: 6,
    memoryFactsRead: relevantMemories.length,
    risksEscalated: risks.length,
    humanDecisions: 1,
    fallbackProtected: !qwenLive
  };
}

export function parseRfqDeterministically(rfq: RfqScenario): ParsedRfq {
  const quantity = extractQuantity(rfq.rawMessage) || (rfq.isCustomDraft ? 1 : rfq.expectedQuantity);
  const destination = extractDestination(rfq.rawMessage) || (rfq.isCustomDraft ? "Needs confirmation" : rfq.destination);
  const deadlineDays = extractDeadlineDays(rfq.rawMessage) || (rfq.isCustomDraft ? 14 : rfq.deadlineDays);
  const uncertaintyFlags = [];

  if (rfq.isCustomDraft && !extractQuantity(rfq.rawMessage)) {
    uncertaintyFlags.push("Quantity was not explicit; defaulted to one item.");
  }

  if (rfq.isCustomDraft && !extractDestination(rfq.rawMessage)) {
    uncertaintyFlags.push("Destination was not explicit.");
  }

  return {
    quantity,
    destination,
    deadlineDays,
    language: detectLanguage(rfq.rawMessage),
    commercialTerms: extractTerms(rfq.rawMessage),
    productHints: [],
    shippingPreference: "",
    paymentPreference: "",
    uncertaintyFlags,
    confidence: 0.72,
    priority: rfq.priority
  };
}

export function matchProducts(message: string, catalog: Product[]): ProductCandidate[] {
  const normalized = normalize(message);

  return catalog
    .map((product) => {
      const aliasHits = product.aliases.filter((alias) =>
        normalized.includes(normalize(alias))
      );
      const nameHits = normalize(product.name)
        .split(" ")
        .filter((part) => part.length > 3 && normalized.includes(part));
      const score = Math.min(0.98, aliasHits.length * 0.44 + nameHits.length * 0.08);

      return {
        product,
        score: Number(score.toFixed(2)),
        reason: aliasHits.length
          ? `Matched aliases: ${aliasHits.join(", ")}`
          : `Matched product terms: ${nameHits.join(", ") || "weak catalog overlap"}`
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function buildUncatalogedProductCandidate({
  parsed,
  rfq
}: {
  parsed: ParsedRfq;
  rfq: RfqScenario;
}): ProductCandidate {
  const targetPrice = extractTargetPrice(rfq.rawMessage);
  const productName = extractProductName(rfq.rawMessage, parsed.productHints);
  const listPriceUsd = targetPrice || 120;

  return {
    product: {
      sku: "CUSTOM-REVIEW",
      name: productName,
      category: "Uncataloged inquiry",
      aliases: [],
      hsCode: "TBD",
      origin: "TBD",
      stock: 0,
      unitCostUsd: roundMoney(listPriceUsd * 0.62),
      listPriceUsd,
      leadTimeDays: 10,
      moq: 1,
      certification: []
    },
    score: 0.38,
    reason: "No catalog SKU matched; created a manual review item from buyer text.",
    isUncataloged: true
  };
}

export function recallMemories(customer: Customer, message: string): MemoryRecord[] {
  const normalized = normalize(message);

  return customer.memory
    .map((memory) => ({
      ...memory,
      relevance: scoreMemory(memory, normalized)
    }))
    .filter((memory) => memory.relevance >= 0.28)
    .sort((a, b) => b.relevance - a.relevance);
}

export function chooseShipping(
  customer: Customer,
  rfq: RfqScenario,
  memories: MemoryRecord[]
): ScoredShippingOption {
  const marketOptions = shippingOptions.filter((option) =>
    option.markets.includes(customer.market)
  );
  const prefersDhl = memories.some((memory) =>
    normalize(memory.title).includes("dhl")
  );
  const costCeiling = extractFreightCeiling(rfq.rawMessage);

  const scored = marketOptions.map((option) => {
    const preferenceBoost = prefersDhl && option.carrier.includes("DHL") ? 0.22 : 0;
    const speedFit = rfq.deadlineDays >= option.days ? 0.28 : -0.32;
    const costFit = costCeiling && option.costUsd > costCeiling ? -0.24 : 0.12;
    const reliability = option.reliability * 0.26;

    return {
      ...option,
      score: Number((preferenceBoost + speedFit + costFit + reliability).toFixed(2))
    };
  });

  const selected = scored.sort((a, b) => b.score - a.score)[0];
  if (!selected) throw new Error(`No shipping option configured for ${customer.market}`);
  return selected;
}

export function priceQuote({
  customer,
  product,
  quantity,
  shipping,
  memories
}: {
  customer: Customer;
  product: Product;
  quantity: number;
  shipping: ScoredShippingOption;
  memories: MemoryRecord[];
}): Quote {
  const safeQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
  const discount = computeDiscount(customer, memories);
  const unitPrice = roundMoney(product.listPriceUsd * (1 - discount));
  const goodsTotal = roundMoney(unitPrice * safeQuantity);
  const landedTotal = roundMoney(goodsTotal + shipping.costUsd);
  const productCost = roundMoney(product.unitCostUsd * safeQuantity);
  const grossProfit = roundMoney(goodsTotal - productCost);
  const margin = Number((grossProfit / goodsTotal).toFixed(3));
  const depositRate =
    customer.relationship === "New buyer" ? pricingRules.newBuyerDepositRate : 0;

  return {
    sku: product.sku,
    productName: product.name,
    quantity: safeQuantity,
    unitPrice,
    goodsTotal,
    shippingCost: shipping.costUsd,
    landedTotal,
    grossProfit,
    margin,
    discount,
    depositRate,
    paymentTerms:
      depositRate > 0
        ? `${Math.round(depositRate * 100)}% deposit, balance before shipment`
        : customer.paymentTerms,
    validityDays: pricingRules.quoteValidityDays
  };
}

export function assessRisks({
  customer,
  parsed,
  productCandidates,
  quote,
  rfq,
  selectedProduct
}: {
  customer: Customer;
  parsed: ParsedRfq;
  productCandidates: ProductCandidate[];
  quote: Quote;
  rfq: RfqScenario;
  selectedProduct: ProductCandidate;
}): QuoteRisk[] {
  const risks: QuoteRisk[] = [];
  const runnerUp = productCandidates[1];

  if (selectedProduct.isUncataloged) {
    risks.push({
      level: "high",
      title: "Manual product review",
      detail: "The buyer text does not match the live catalog, so sourcing and authenticity must be confirmed."
    });
  }

  if (rfq.isCustomDraft && /(?:\bi want to sell\b|\bsell it\b|\bresale\b)/i.test(rfq.rawMessage)) {
    risks.push({
      level: "medium",
      title: "Inbound sales intent",
      detail: "The message sounds like a seller offer, not a buyer RFQ. Route to intake review before quoting."
    });
  }

  if (runnerUp && selectedProduct.score - runnerUp.score < 0.18) {
    risks.push({
      level: "high",
      title: "Product ambiguity",
      detail: `${selectedProduct.product.sku} and ${runnerUp.product.sku} are both plausible.`
    });
  }

  if (quote.margin < pricingRules.floorMargin) {
    risks.push({
      level: "high",
      title: "Margin below floor",
      detail: `Margin is ${Math.round(quote.margin * 100)}%, below the ${Math.round(
        pricingRules.floorMargin * 100
      )}% floor.`
    });
  }

  if (!selectedProduct.isUncataloged && selectedProduct.product.stock < parsed.quantity) {
    risks.push({
      level: "high",
      title: "Inventory shortfall",
      detail: `${selectedProduct.product.stock} units available for ${parsed.quantity} requested.`
    });
  }

  if (customer.relationship === "New buyer") {
    risks.push({
      level: "medium",
      title: "New buyer payment terms",
      detail: "Deposit is required before order release."
    });
  }

  if (parsed.deadlineDays < selectedProduct.product.leadTimeDays + 2) {
    risks.push({
      level: "medium",
      title: "Tight delivery promise",
      detail: "Requested deadline leaves little buffer after production release."
    });
  }

  return risks;
}

function buildTimeline({
  customer,
  parsed,
  productCandidates,
  qwenTrace,
  quote,
  relevantMemories,
  risks,
  shipping
}: {
  customer: Customer;
  parsed: ParsedRfq;
  productCandidates: ProductCandidate[];
  qwenTrace: QwenTrace | null;
  quote: Quote;
  relevantMemories: MemoryRecord[];
  risks: QuoteRisk[];
  shipping: ScoredShippingOption;
}): TimelineStep[] {
  const topCandidate = productCandidates[0]!;
  const productMatchTitle = topCandidate.isUncataloged
    ? "Created manual review item for uncataloged product"
    : "Mapped vague buyer language to catalog SKU";
  const productMatchSummary = topCandidate.isUncataloged
    ? `${topCandidate.product.name} requires catalog, sourcing, and authenticity review.`
    : `${topCandidate.product.sku}: ${topCandidate.product.name}`;

  return [
    {
      id: "rfq-parser",
      role: qwenTrace?.status === "live" ? "Qwen RFQ Parser" : "RFQ Parser",
      title:
        qwenTrace?.status === "live"
          ? "Qwen converted multilingual text into quote fields"
          : "Converted message into a structured request",
      confidence: qwenTrace?.status === "live" ? parsed.confidence || 0.88 : 0.92,
      summary: `${parsed.quantity} units for ${parsed.destination}, deadline in ${parsed.deadlineDays} days.`,
      evidence: [
        parsed.language,
        parsed.commercialTerms || parsed.paymentPreference || "No explicit commercial terms found",
        ...(parsed.uncertaintyFlags || []).slice(0, 1)
      ],
      toolReads:
        qwenTrace?.status === "live"
          ? [qwenTrace.model || "qwen3.6-flash", "rfq_message", "catalog_context"]
          : ["deterministic_parser", "rfq_message"],
      executionType: qwenTrace?.status === "live" ? "qwen-cloud" : "resilient-fallback"
    },
    {
      id: "memory-recall",
      role: "Memory Agent",
      title: "Recalled customer-specific preferences",
      confidence: relevantMemories.length ? 0.89 : 0.63,
      summary: relevantMemories.length
        ? `${relevantMemories.length} memories changed the quote strategy.`
        : "No strong customer memories changed this quote.",
      evidence: relevantMemories.map((memory) => memory.title).slice(0, 3),
      toolReads: ["customer_profile", "persistent_memory_store"],
      executionType: "deterministic-tool"
    },
    {
      id: "product-match",
      role: "Product Matcher",
      title: productMatchTitle,
      confidence: topCandidate.score,
      summary: productMatchSummary,
      evidence: productCandidates.slice(0, 2).map((candidate) => candidate.reason),
      toolReads: ["catalog", "inventory"],
      executionType: "deterministic-tool"
    },
    {
      id: "pricing-agent",
      role: "Pricing Agent",
      title: "Calculated price, margin, freight, and terms",
      confidence: 0.87,
      summary: `${formatUsd(quote.landedTotal)} landed total with ${Math.round(
        quote.margin * 100
      )}% gross margin.`,
      evidence: [
        `${formatUsd(quote.unitPrice)} unit price`,
        `${shipping.carrier} ${shipping.mode}, ${shipping.days} days`,
        quote.paymentTerms
      ],
      toolReads: ["price_rules", "freight_table", "customer_terms"],
      executionType: "deterministic-tool"
    },
    {
      id: "approval-checkpoint",
      role: "Approval Agent",
      title: "Stopped before sending commercial offer",
      confidence: 0.95,
      summary: risks.length
        ? `${risks.length} risk checks require review.`
        : "No blocking risks, but approval is still required.",
      evidence: risks.length
        ? risks.map((risk) => `${risk.title}: ${risk.detail}`)
        : ["Ready for human approval"],
      toolReads: ["risk_policy", "approval_policy"],
      executionType: "human-checkpoint"
    }
  ];
}

function mergeParsedRfq(
  fallback: ParsedRfq,
  qwenParsed: QwenParsedRfq | null | undefined
): ParsedRfq {
  if (!qwenParsed) return fallback;

  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(qwenParsed).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== null && value !== "";
      })
    ),
    quantity: qwenParsed.quantity || fallback.quantity,
    deadlineDays: qwenParsed.deadlineDays || fallback.deadlineDays,
    destination: qwenParsed.destination || fallback.destination,
    productHints: qwenParsed.productHints || [],
    uncertaintyFlags: qwenParsed.uncertaintyFlags || []
  };
}

function buildDraftEmail({
  customer,
  parsed,
  quote,
  risks,
  shipping
}: {
  customer: Customer;
  parsed: ParsedRfq;
  quote: Quote;
  risks: QuoteRisk[];
  shipping: ScoredShippingOption;
}): string {
  const riskSentence = risks.length
    ? "I have included a note below for one item that needs confirmation before release."
    : "Everything is ready for approval and order release.";

  return [
    `Dear ${customer.contact},`,
    "",
    `Thank you for your RFQ. We can offer ${parsed.quantity} units of ${quote.productName} (${quote.sku}).`,
    `Unit price: ${formatUsd(quote.unitPrice)}. Goods total: ${formatUsd(
      quote.goodsTotal
    )}.`,
    `Freight: ${shipping.carrier} ${shipping.mode}, ${shipping.days} days, ${formatUsd(
      quote.shippingCost
    )}.`,
    `Landed total: ${formatUsd(quote.landedTotal)}. Payment terms: ${quote.paymentTerms}.`,
    `Quote validity: ${quote.validityDays} days.`,
    "",
    riskSentence,
    "",
    "Best regards,",
    "QuoteX Sales Desk"
  ].join("\n");
}

function buildMemoryWrite(analysis: Analysis): MemoryRecord {
  const shippingPreference = `${analysis.customer.company} accepted ${analysis.shipping.carrier} for ${analysis.rfq.destination}.`;

  return {
    id: `mem-${analysis.rfq.id}-${Date.now()}`,
    type: "approval_outcome",
    title: `Accepted ${analysis.quote.productName} at ${formatUsd(
      analysis.quote.unitPrice
    )} via ${analysis.shipping.carrier}`,
    evidence: `${shippingPreference} Landed total was ${formatUsd(
      analysis.quote.landedTotal
    )}.`,
    confidence: 0.86,
    sku: analysis.quote.sku,
    acceptedUnitPriceUsd: analysis.quote.unitPrice,
    acceptedCarrier: analysis.shipping.carrier,
    updatedAt: new Date().toISOString().slice(0, 10)
  };
}

function extractProductName(message: string, hints: string[] = []): string {
  const hinted = hints.find((hint) => typeof hint === "string" && hint.trim().length > 2);

  if (hinted) {
    return fitText(hinted, 68);
  }

  const withoutPrice = message.replace(/(?:\$|usd\s*)\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*(?:usd|dollars|\$)/gi, "");
  const firstClause = withoutPrice
    .split(/[.!?\n]/)[0]
    .replace(/\b(i want to|please|can you|need|quote|sell it|brand new condition)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return fitText(firstClause || "Uncataloged buyer item", 68);
}

function extractTargetPrice(message: string): number | null {
  const match =
    message.match(/(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)/i) ||
    message.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:usd|dollars|\$)/i);

  if (!match) return null;

  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function computeDiscount(customer: Customer, memories: MemoryRecord[]): number {
  let discount = 0;

  if (customer.relationship === "Repeat buyer") {
    discount += pricingRules.repeatBuyerDiscount;
  }

  if (customer.relationship === "Strategic account") {
    discount += pricingRules.strategicAccountDiscount;
  }

  if (memories.some((memory) => memory.type === "commercial_preference")) {
    discount += 0.005;
  }

  if (memories.some((memory) => memory.type === "approval_outcome")) {
    discount += 0.005;
  }

  return Math.min(discount, 0.06);
}

function extractQuantity(message: string): number | null {
  const unitMatch = message.match(
    /(\d{1,6})\s*(units|pcs|pieces|個|台|sets|boards|controllers|items|bags)/i
  );

  if (unitMatch) {
    return Number(unitMatch[1].replaceAll(",", ""));
  }

  const intentMatch = message.match(
    /(?:qty|quantity|quote|need|order|purchase|prepare price for|price for)\D{0,32}(\d{1,6})(?![\d,]*\s*(?:usd|dollars|\$))/i
  );

  return intentMatch ? Number(intentMatch[1].replaceAll(",", "")) : null;
}

function extractDestination(message: string): string {
  const match = message.match(/(?:ship to|delivery|deliver to|destination)\s+([A-Z][A-Za-z .-]{2,40})/);
  return match ? match[1].trim().replace(/[.!?,]$/, "") : "";
}

function extractDeadlineDays(message: string): number | null {
  const dayMatch = message.match(/(?:within|in|deadline)\s+(\d{1,3})\s*(?:days|day)/i);
  if (dayMatch) return Number(dayMatch[1]);

  return null;
}

function extractFreightCeiling(message: string): number | null {
  const match = message.match(/(?:above|under|below|over)\s*(\d{2,5})\s*(?:usd|dollars|\$)?/i);
  return match ? Number(match[1]) : null;
}

function extractTerms(message: string): string {
  if (/net\s*30/i.test(message)) return "Net 30 requested";
  if (/net\s*15/i.test(message)) return "Net 15 requested";
  if (/deposit/i.test(message)) return "Deposit mentioned";
  return "";
}

function detectLanguage(message: string): string {
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(message)) return "Japanese";
  if (/[äöüß]/i.test(message)) return "German";
  return "English";
}

function scoreMemory(memory: MemoryRecord, normalizedMessage: string): number {
  const text = normalize(`${memory.title} ${memory.evidence} ${memory.type}`);
  const memoryTerms = text.split(" ").filter((term) => term.length > 4);
  const overlap = memoryTerms.filter((term) => normalizedMessage.includes(term)).length;
  const typeBoost =
    memory.type.includes("shipping") && /ship|freight|dhl|delivery|送料/.test(normalizedMessage)
      ? 0.42
      : 0;
  const commercialBoost =
    memory.type.includes("commercial") && /payment|terms|net|支払い/.test(normalizedMessage)
      ? 0.35
      : 0;
  const priorOutcomeBoost =
    memory.type === "approval_outcome" && /same|again|repeat|previous|前回|同じ|追加/.test(normalizedMessage)
      ? 0.34
      : 0;

  return Number(
    Math.min(0.99, overlap * 0.09 + typeBoost + commercialBoost + priorOutcomeBoost + 0.12).toFixed(2)
  );
}

function normalize(value: unknown): string {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function fitText(value: unknown, maxLength: number): string {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function findById<T extends { id: string }>(collection: T[], id: string): T {
  const item = collection.find((candidate) => candidate.id === id);

  if (!item) {
    throw new Error(`Missing item: ${id}`);
  }

  return item;
}
