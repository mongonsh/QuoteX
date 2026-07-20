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
  customerIds?: string[];
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
  origin?: string;
  deadlineDays: number;
  priority: "High" | "Medium" | "Low";
  demoLabel?: string;
  isCustomDraft?: boolean;
  source?: "demo" | "seller-listing";
  listingId?: string;
}

export type ProductListingCategory =
  | "Handbag"
  | "Watch"
  | "Jewelry"
  | "Accessories"
  | "Fashion"
  | "Electronics"
  | "Home & Garden"
  | "Beauty"
  | "Collectibles"
  | "Sports"
  | "Industrial"
  | "Other";

export type ProductListingCondition =
  | "New or unworn"
  | "Excellent"
  | "Very good"
  | "Good"
  | "Fair";

// Kept as aliases so existing persisted listings remain source-compatible.

export interface SellerListingPhoto {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface SellerListing {
  id: string;
  sellerName: string;
  sellerEmail: string;
  sellerLocation: string;
  targetMarket: "Japan" | "United States" | "Germany";
  brand: string;
  model: string;
  category: ProductListingCategory;
  condition: ProductListingCondition;
  color: string;
  material: string;
  manufactureYear: number | null;
  askingPriceUsd: number;
  desiredSaleDays: number;
  description: string;
  authenticityNotes: string;
  ownershipConfirmed: boolean;
  status: "intake" | "ready";
  photo: SellerListingPhoto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSellerListingInput
  extends Omit<SellerListing, "id" | "status" | "photo" | "createdAt" | "updatedAt"> {
  photo: UploadedMedia;
}

export interface SellerIntakeAiFields {
  sellerName: string | null;
  sellerEmail: string | null;
  sellerLocation: string | null;
  targetMarket: SellerListing["targetMarket"] | null;
  brand: string | null;
  model: string | null;
  category: ProductListingCategory | null;
  condition: ProductListingCondition | null;
  color: string | null;
  material: string | null;
  manufactureYear: number | null;
  askingPriceUsd: number | null;
  desiredSaleDays: number | null;
  description: string | null;
  authenticityNotes: string | null;
}

export type SellerIntakeFieldName = keyof SellerIntakeAiFields;

export interface SellerIntakeAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SellerIntakeAssistantReply {
  reply: string;
  fields: SellerIntakeAiFields;
  missingFields: SellerIntakeFieldName[];
  readyToReview: boolean;
  confidence: number;
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
  requiresAuthentication?: boolean;
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
  voiceDesignModel?: string;
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
  attemptedModels?: string[];
  inputGrounding?: string;
  assetPersistence?: string;
  providerStatus?: number;
}

export type AgentSkillName =
  | "structure_request"
  | "retrieve_customer_memory"
  | "match_product_catalog"
  | "select_shipping_route"
  | "calculate_margin_safe_quote"
  | "enforce_approval_policy";

export interface AgentSkillExecution {
  id: string;
  toolCallId: string;
  name: AgentSkillName;
  label: string;
  status: "succeeded" | "failed";
  initiatedBy: "qwen" | "guardrail";
  elapsedMs: number;
  inputSummary: string;
  outputSummary: string;
  evidence: string[];
  error?: string;
}

export interface AgentDecisionSnapshot {
  parsed: ParsedRfq;
  productCandidates: ProductCandidate[];
  selectedProduct: ProductCandidate;
  relevantMemories: MemoryRecord[];
  shipping: ScoredShippingOption;
  quote: Quote;
  risks: QuoteRisk[];
}

export interface AgentRunEvidence {
  runId: string;
  auditDigest: string;
  status: "live" | "guarded-fallback" | "failed";
  model: string;
  endpointHost: string;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  plannerTurns: number;
  maxPlannerTurns: number;
  requiredSkills: AgentSkillName[];
  completedSkills: AgentSkillName[];
  skillExecutions: AgentSkillExecution[];
  finalSummary: string;
  approvalGate: "human-review-required";
  usage: QwenUsage | null;
  fallbackReason?: string;
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
  plannerTurns?: number;
  toolCalls?: number;
  skillCoverage?: number;
  auditDigest?: string;
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
  agentRun?: AgentRunEvidence;
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

export interface ProductVideoAsset {
  taskId: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  model: string;
  prompt: string;
  resolution: "720P" | "1080P";
  duration: number;
  videoUrl?: string;
  error?: string;
  usage?: Record<string, unknown> | null;
}

export type CustomerAgentIntent =
  | "quote-status"
  | "delivery"
  | "product"
  | "payment"
  | "human-support"
  | "general";

export interface CustomerAgentReply {
  reply: string;
  intent: CustomerAgentIntent;
  confidence: number;
  needsHuman: boolean;
  suggestedActions: string[];
}

export interface QwenConfig {
  apiKey: string;
  agentApiKey: string;
  agentBaseUrl: string;
  imageApiKey: string;
  speechApiKey: string;
  speechBaseUrl: string;
  ttsApiKey: string;
  baseUrl: string;
  model: string;
  agentModel: string;
  marketingModel: string;
  visionModel: string;
  speechModel: string;
  voiceDesignModel: string;
  voiceDesignTargetModel: string;
  voiceDesignEndpoint: string;
  ttsModel: string;
  ttsVoice: string;
  ttsEndpoint: string;
  imageModel: string;
  imageFallbackModel: string;
  imageEndpoint: string;
  videoApiKey: string;
  videoModel: string;
  videoEndpoint: string;
  videoTaskBaseUrl: string;
  videoTimeoutMs: number;
  timeoutMs: number;
}

export interface StorageConfig {
  provider: "sqlite" | "alibaba";
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  tableStore: {
    instanceName: string;
    endpoint: string;
    listingsTable: string;
    agentRunsTable: string;
    autoCreateTables: boolean;
  };
  oss: {
    region: string;
    bucket: string;
    internal: boolean;
    objectPrefix: string;
    serverSideEncryption: "AES256" | "none";
  };
}

export type ScoredShippingOption = ShippingOption & { score: number };

export interface AppConfig {
  qwen: QwenConfig;
  storage: StorageConfig;
}
