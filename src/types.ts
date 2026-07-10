export type QwenMode = "qwen-live" | "deterministic-demo";
export type ThemeMode = "dark" | "light";
export type RiskLevel = "low" | "medium" | "high";
export type ExecutionType =
  | "qwen-cloud"
  | "resilient-fallback"
  | "deterministic-tool"
  | "human-checkpoint"
  | "memory-write";

export interface MemoryRecord {
  id: string;
  type: string;
  title: string;
  evidence: string;
  confidence: number;
  updatedAt: string;
  relevance?: number;
  sku?: string;
  acceptedUnitPriceUsd?: number;
  acceptedCarrier?: string;
}

export interface Customer {
  id: string;
  company: string;
  contact: string;
  market: string;
  language: string;
  paymentTerms: string;
  creditLimitUsd: number;
  relationship: string;
  memory: MemoryRecord[];
}

export interface Product {
  sku: string;
  name: string;
  category: string;
  aliases: string[];
  hsCode: string;
  origin: string;
  stock: number;
  unitCostUsd: number;
  listPriceUsd: number;
  leadTimeDays: number;
  moq: number;
  certification: string[];
}

export interface ShippingOption {
  id: string;
  route: string;
  carrier: string;
  mode: string;
  days: number;
  costUsd: number;
  reliability: number;
  markets: string[];
  score?: number;
}

export interface RfqScenario {
  id: string;
  customerId: string;
  receivedAt: string;
  channel: string;
  subject: string;
  rawMessage: string;
  expectedQuantity: number;
  destination: string;
  deadlineDays: number;
  priority: "High" | "Medium" | "Low";
  demoLabel?: string;
  isCustomDraft?: boolean;
}

export interface PricingRules {
  targetMargin: number;
  floorMargin: number;
  repeatBuyerDiscount: number;
  strategicAccountDiscount: number;
  newBuyerDepositRate: number;
  quoteValidityDays: number;
}

export interface ParsedRfq {
  quantity: number;
  destination: string;
  deadlineDays: number;
  language: string;
  commercialTerms: string;
  productHints: string[];
  shippingPreference: string;
  paymentPreference: string;
  uncertaintyFlags: string[];
  confidence: number;
  priority?: RfqScenario["priority"];
}

export interface QwenParsedRfq
  extends Omit<ParsedRfq, "quantity" | "deadlineDays" | "priority"> {
  quantity: number | null;
  deadlineDays: number | null;
}

export interface ProductCandidate {
  product: Product;
  score: number;
  reason: string;
  isUncataloged?: boolean;
}

export interface Quote {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  goodsTotal: number;
  shippingCost: number;
  landedTotal: number;
  grossProfit: number;
  margin: number;
  discount: number;
  depositRate: number;
  paymentTerms: string;
  validityDays: number;
}

export interface QuoteRisk {
  level: RiskLevel;
  title: string;
  detail: string;
}

export interface TimelineStep {
  id: string;
  role: string;
  title: string;
  confidence: number;
  summary: string;
  evidence: string[];
  toolReads: string[];
  executionType: ExecutionType;
}

export interface QwenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface QwenTrace {
  status: string;
  mode?: QwenMode;
  model?: string;
  briefingModel?: string;
  endpointHost?: string;
  elapsedMs?: number;
  usage?: QwenUsage | null;
  prompt?: string;
  response?: unknown;
  rawResponse?: string;
  reason?: string;
  error?: string;
  briefingError?: string | null;
  requestId?: string | null;
}

export interface MemoryImpact {
  factsApplied: number;
  goodsSavingsUsd: number;
  routingConfidenceLift: number;
  selectedCarrier: string;
  baselineCarrier: string;
  changedCarrier: boolean;
  summary: string;
}

export interface ExecutionProof {
  auditId: string;
  qwenStatus: string;
  qwenCalls: number;
  autonomousStages: number;
  deterministicToolStages: number;
  policyChecks: number;
  memoryFactsRead: number;
  risksEscalated: number;
  humanDecisions: number;
  fallbackProtected: boolean;
  elapsedMs?: number;
}

export interface Approval {
  required: boolean;
  status: "pending" | "approved";
  reason: string;
  approvedAt?: string;
}

export interface Analysis {
  id: string;
  rfq: RfqScenario;
  customer: Customer;
  parsed: ParsedRfq;
  productCandidates: ProductCandidate[];
  selectedProduct: ProductCandidate;
  relevantMemories: MemoryRecord[];
  memoryImpact: MemoryImpact;
  shipping: ShippingOption & { score: number };
  quote: Quote;
  risks: QuoteRisk[];
  timeline: TimelineStep[];
  executionProof: ExecutionProof;
  qwenTrace: QwenTrace;
  approval: Approval;
  draftEmail: string;
  memoryWrite?: MemoryRecord;
}

export type MemoryStore = Record<string, MemoryRecord[]>;

export interface UploadedMedia {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

export interface MarketingBrief {
  headline: string;
  subhead: string;
  badge: string;
  cta: string;
  visualPrompt: string;
  palette: {
    background: string;
    accent: string;
    ink: string;
  };
  complianceNotes: string[];
}

export interface MarketingAsset {
  imageDataUrl: string;
  imageUrl?: string;
  mimeType: string;
  fileName: string;
  brief: MarketingBrief;
  sourceMedia: Omit<UploadedMedia, "dataUrl">;
  visualMode: string;
}

export interface QwenConfig {
  apiKey: string;
  imageApiKey: string;
  baseUrl: string;
  model: string;
  marketingModel: string;
  imageModel: string;
  imageEndpoint: string;
  timeoutMs: number;
}

export type ScoredShippingOption = ShippingOption & { score: number };

export interface AppConfig {
  qwen: QwenConfig;
}
