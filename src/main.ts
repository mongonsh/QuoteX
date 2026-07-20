import { customers, products, rfqScenarios } from "./data.js";
import {
  SpeechTranscriptAccumulator,
  type SpeechRecognitionEventLike
} from "./speech-transcript.js";
import {
  forgetCustomerOutcomes,
  loadMemoryStore,
  rememberCustomerOutcome,
  saveMemoryStore,
  withLearnedMemories
} from "./memory-store.js";
import {
  buildMarketplaceDrafts,
  type MarketplaceDraft
} from "./marketplace-adapters.js";
import { getQwenMode, setQwenMode } from "./qwen-client.js";
import { approveQuote, formatUsd, runAutopilot } from "./rfq-engine.js";
import type {
  Analysis,
  CreateSellerListingInput,
  Customer,
  CustomerAgentReply,
  ExecutionType,
  MarketingAsset,
  MarketingBrief,
  MemoryRecord,
  MemoryStore,
  ProductVideoAsset,
  QwenMode,
  QwenTrace,
  QuoteRisk,
  RfqScenario,
  SellerListing,
  SellerIntakeAiFields,
  SellerIntakeAssistantMessage,
  SellerIntakeAssistantReply,
  SellerIntakeFieldName,
  TimelineStep,
  ThemeMode,
  UploadedMedia
} from "./types.js";

type WorkspaceView = "workbench" | "voice" | "memory" | "quote" | "creative" | "graph" | "trace";
type VoiceCaptureTarget = "rfq" | "customer-agent" | "seller-intake";
type VoiceAgentPhaseKind =
  | "ready"
  | "listening"
  | "following"
  | "using-tools"
  | "responding"
  | "waiting-approval"
  | "completed"
  | "recovering";

interface VoiceAgentPhase {
  kind: VoiceAgentPhaseKind;
  label: string;
  detail: string;
}

interface VoiceAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: QwenTrace | null;
  ttsTrace?: QwenTrace | null;
  audioDataUrl?: string;
  voiceMode?: "cloud-tts" | "text-only";
  voiceProvider?: string;
  voiceName?: string;
  suggestedActions?: string[];
  needsHuman?: boolean;
  intent?: string;
  attachment?: UploadedMedia;
}

interface SellerIntakeDraft {
  sellerName: string;
  sellerEmail: string;
  sellerLocation: string;
  targetMarket: SellerListing["targetMarket"] | "";
  brand: string;
  model: string;
  category: SellerListing["category"] | "";
  condition: SellerListing["condition"] | "";
  color: string;
  material: string;
  manufactureYear: string;
  askingPriceUsd: string;
  desiredSaleDays: string;
  description: string;
  authenticityNotes: string;
  ownershipConfirmed: boolean;
}

type SellerTextField = Exclude<keyof SellerIntakeDraft, "ownershipConfirmed">;

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface BrowserRecognitionSession {
  recognition: BrowserSpeechRecognition;
  discard: boolean;
}

interface AppState {
  selectedRfqId: string;
  rfqDrafts: Record<string, string>;
  analysis: Analysis | null;
  visibleStageCount: number;
  isRunning: boolean;
  voice: {
    isListening: boolean;
    isTranscribing: boolean;
    status: string;
    error: string;
    provider: string;
    trace: QwenTrace | null;
  };
  voiceAgent: {
    messages: VoiceAgentMessage[];
    draft: string;
    attachment: UploadedMedia | null;
    transcriptExpanded: boolean;
    isThinking: boolean;
    isSpeaking: boolean;
    speakingMessageId: string;
    error: string;
  };
  listings: {
    items: SellerListing[];
    status: "loading" | "ready" | "error";
    error: string;
  };
  examplesExpanded: boolean;
  sellerIntake: {
    open: boolean;
    isSaving: boolean;
    error: string;
    draft: SellerIntakeDraft;
    photo: UploadedMedia | null;
    mode: "ai" | "manual";
    ai: {
      messages: SellerIntakeAssistantMessage[];
      draft: string;
      isThinking: boolean;
      error: string;
      missingFields: SellerIntakeFieldName[];
      confidence: number;
      trace: QwenTrace | null;
    };
  };
  listingNotice: string;
  productMedia: UploadedMedia | null;
  marketingAsset: MarketingAsset | null;
  marketingTrace: QwenTrace | null;
  productVideo: ProductVideoAsset | null;
  videoTrace: QwenTrace | null;
  videoError: string;
  creativeError: string;
  isGeneratingCreative: boolean;
  isGeneratingVideo: boolean;
  approvedAnalyses: Analysis[];
  selectedView: WorkspaceView;
  mobileMenuOpen: boolean;
  theme: ThemeMode;
  qwenMode: QwenMode;
  memoryStore: MemoryStore;
  serviceHealth: {
    status: "checking" | "online" | "offline";
    configured: boolean;
    model: string;
    speechConfigured: boolean;
    speechModel: string;
    agentModel: string;
    ttsConfigured: boolean;
    ttsModel: string;
    ttsVoice: string;
    voiceDesignModel: string;
    visionModel: string;
    imageModel: string;
    imageFallbackModel: string;
    videoConfigured: boolean;
    videoModel: string;
  };
  runError: string;
}

interface CreativeApiResponse {
  ok?: boolean;
  asset?: MarketingAsset;
  trace?: QwenTrace;
  error?: string;
}

interface ProductVideoApiResponse {
  ok?: boolean;
  asset?: ProductVideoAsset;
  trace?: QwenTrace;
  error?: string;
}

interface TranscriptionApiResponse {
  ok?: boolean;
  transcript?: string;
  trace?: QwenTrace;
  error?: string;
}

interface CustomerAgentApiResponse {
  ok?: boolean;
  answer?: CustomerAgentReply;
  trace?: QwenTrace;
  error?: string;
}

interface SpeechSynthesisApiResponse {
  ok?: boolean;
  audioDataUrl?: string;
  mimeType?: string;
  voice?: string;
  provider?: string;
  trace?: QwenTrace;
  error?: string;
}

interface ListingApiResponse {
  ok?: boolean;
  listing?: SellerListing;
  listings?: SellerListing[];
  error?: string;
}

interface SellerIntakeAssistantApiResponse {
  ok?: boolean;
  answer?: SellerIntakeAssistantReply;
  trace?: QwenTrace;
  error?: string;
}

type DealGraphNodeKind =
  | "input"
  | "media"
  | "model"
  | "memory"
  | "product"
  | "quote"
  | "risk"
  | "route"
  | "approval"
  | "creative";

interface DealGraphNode {
  id: string;
  label: string;
  detail: string;
  kind: DealGraphNodeKind;
  x: number;
  y: number;
  status: string;
  metric?: string;
  image?: string;
}

interface DealGraphLink {
  from: string;
  to: string;
  label: string;
  kind: "agent" | "memory" | "policy" | "media";
}

interface DealGraphAnchor {
  label: string;
  detail: string;
  status: string;
}

interface DealGraphTrajectoryItem {
  role: string;
  title: string;
  status: string;
}

interface DealGraph {
  nodes: DealGraphNode[];
  links: DealGraphLink[];
  anchors: DealGraphAnchor[];
  trajectory: DealGraphTrajectoryItem[];
}

const app = document.querySelector<HTMLElement>("[data-app-shell]") as HTMLElement;
if (!app) throw new Error("QuoteX app shell is missing");

const speechWindow = window as Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};
const SpeechRecognition =
  speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition || null;
const THEME_STORAGE_KEY = "quotex:theme";
const SELLER_ONBOARDING_ID = "seller-onboarding";
const FLAGSHIP_RFQ_ID = "nordlicht-cashmere-500";
const FLAGSHIP_RFQ_IDS = new Set([
  FLAGSHIP_RFQ_ID,
  "nordlicht-cashmere-replay"
]);
const FLAGSHIP_MEDIA_URL = "./assets/demo/mongolian-cashmere-scarves.png";
const SELLER_ONBOARDING_RFQ: RfqScenario = {
  id: SELLER_ONBOARDING_ID,
  customerId: SELLER_ONBOARDING_ID,
  receivedAt: new Date().toISOString(),
  channel: "Seller workspace",
  subject: "Create your first seller listing",
  rawMessage: "",
  expectedQuantity: 1,
  destination: "Target market not selected",
  deadlineDays: 30,
  priority: "Medium",
  source: "seller-listing"
};
const SELLER_TEXT_FIELDS: SellerTextField[] = [
  "sellerName",
  "sellerEmail",
  "sellerLocation",
  "targetMarket",
  "brand",
  "model",
  "category",
  "condition",
  "color",
  "material",
  "manufactureYear",
  "askingPriceUsd",
  "desiredSaleDays",
  "description",
  "authenticityNotes"
];
const SELLER_REQUIRED_AI_FIELDS: SellerIntakeFieldName[] = [
  "sellerName",
  "sellerEmail",
  "sellerLocation",
  "targetMarket",
  "brand",
  "model",
  "category",
  "condition",
  "color",
  "askingPriceUsd",
  "desiredSaleDays",
  "description"
];

const state: AppState = {
  selectedRfqId: FLAGSHIP_RFQ_ID,
  rfqDrafts: {},
  analysis: null,
  visibleStageCount: 0,
  isRunning: false,
  voice: {
    isListening: false,
    isTranscribing: false,
    status:
      supportsAudioRecording()
        ? "Qwen voice ready"
        : SpeechRecognition
          ? "Browser voice ready"
          : "Not supported",
    error: "",
    provider: "",
    trace: null
  },
  voiceAgent: {
    messages: [
      {
        id: "voice-welcome",
        role: "assistant",
        content:
          "Hello, I’m the QuoteX customer assistant. I can explain this request, quote status, delivery plan, product details, and payment terms. Final commercial decisions always stay with a person.",
        voiceMode: "text-only"
      }
    ],
    draft: "",
    attachment: null,
    transcriptExpanded: false,
    isThinking: false,
    isSpeaking: false,
    speakingMessageId: "",
    error: ""
  },
  listings: {
    items: [],
    status: "loading",
    error: ""
  },
  examplesExpanded: false,
  sellerIntake: {
    ...createSellerIntakeState(),
    open: false
  },
  listingNotice: "",
  productMedia: null,
  marketingAsset: null,
  marketingTrace: null,
  productVideo: null,
  videoTrace: null,
  videoError: "",
  creativeError: "",
  isGeneratingCreative: false,
  isGeneratingVideo: false,
  approvedAnalyses: [],
  selectedView: "workbench",
  mobileMenuOpen: false,
  theme: getInitialTheme(),
  qwenMode: getQwenMode(),
  memoryStore: loadMemoryStore(),
  serviceHealth: {
    status: "checking",
    configured: false,
    model: "qwen3.7-plus",
    speechConfigured: false,
    speechModel: "qwen3-asr-flash",
    agentModel: "qwen3.7-plus",
    ttsConfigured: false,
    ttsModel: "qwen3-tts-vd-2026-01-26",
    ttsVoice: "",
    voiceDesignModel: "qwen-voice-design",
    visionModel: "qwen3.7-plus",
    imageModel: "wan2.7-image-pro",
    imageFallbackModel: "qwen-image-2.0-pro",
    videoConfigured: false,
    videoModel: "happyhorse-1.0-i2v"
  },
  runError: ""
};
let activeRecognitionSession: BrowserRecognitionSession | null = null;
let activeMediaRecorder: MediaRecorder | null = null;
let activeMediaStream: MediaStream | null = null;
let recordedAudioChunks: Blob[] = [];
let discardActiveRecording = false;
let preferBrowserVoiceFallback = false;
let activeVoiceCaptureTarget: VoiceCaptureTarget = "rfq";
let activeAgentAudio: HTMLAudioElement | null = null;
let activeCreativeGenerationRevision = 0;
let activeVideoGenerationRevision = 0;

applyTheme(state.theme);
render();
bootstrapServiceHealth();
bootstrapListings();
bootstrapFlagshipMedia();

app.addEventListener("click", async (event) => {
  const action = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
  if (!action) return;

  const { action: actionName } = action.dataset;

  if (actionName === "select-rfq") {
    if (action.dataset.rfqId) await selectRfq(action.dataset.rfqId);
  }

  if (actionName === "toggle-examples") {
    state.examplesExpanded = !state.examplesExpanded;
    render();
  }

  if (actionName === "open-seller-intake") {
    state.sellerIntake.open = true;
    state.sellerIntake.error = "";
    state.mobileMenuOpen = false;
    render();
    window.requestAnimationFrame(() => {
      app.querySelector<HTMLInputElement>("[data-seller-field='sellerName']")?.focus();
    });
  }

  if (actionName === "close-seller-intake") {
    if (!state.sellerIntake.isSaving) {
      if (activeVoiceCaptureTarget === "seller-intake") stopVoiceInput({ discard: true });
      state.sellerIntake.open = false;
      state.sellerIntake.error = "";
      render();
    }
  }

  if (actionName === "set-seller-intake-mode") {
    const mode = action.dataset.mode === "manual" ? "manual" : "ai";
    if (mode !== "ai" && activeVoiceCaptureTarget === "seller-intake") {
      stopVoiceInput({ discard: true });
    }
    state.sellerIntake.mode = mode;
    state.sellerIntake.error = "";
    state.sellerIntake.ai.error = "";
    render();
  }

  if (actionName === "send-seller-intake") {
    await sendSellerIntakeMessage(state.sellerIntake.ai.draft);
  }

  if (actionName === "seller-intake-suggestion" && action.dataset.message) {
    await sendSellerIntakeMessage(action.dataset.message);
  }

  if (actionName === "toggle-seller-intake-voice") {
    if (state.voice.isListening && activeVoiceCaptureTarget === "seller-intake") {
      stopVoiceInput();
    } else {
      stopVoiceInput({ discard: true });
      await startVoiceInput("seller-intake");
    }
  }

  if (actionName === "review-ai-details") {
    if (activeVoiceCaptureTarget === "seller-intake") stopVoiceInput({ discard: true });
    state.sellerIntake.mode = "manual";
    render();
  }

  if (actionName === "restart-seller-intake-ai") {
    if (activeVoiceCaptureTarget === "seller-intake") stopVoiceInput({ discard: true });
    const photo = state.sellerIntake.photo;
    state.sellerIntake = { ...createSellerIntakeState(), open: true, photo };
    render();
  }

  if (actionName === "clear-seller-photo") {
    state.sellerIntake.photo = null;
    state.sellerIntake.error = "";
    render();
  }

  if (actionName === "delete-listing") {
    const listing = getSelectedListing();
    if (listing) await deleteSellerListing(listing);
  }

  if (actionName === "run-autopilot") {
    await runSelectedRfq();
  }

  if (actionName === "run-flagship-demo") {
    if (state.isRunning) return;
    await selectRfq(FLAGSHIP_RFQ_ID);
    state.selectedView = "workbench";
    render();
    await runSelectedRfq();
  }

  if (actionName === "approve-quote" && state.analysis) {
    state.analysis = approveQuote(state.analysis);
    const memoryWrite = state.analysis.memoryWrite;
    if (!memoryWrite) throw new Error("Approved analysis did not produce a memory write");
    state.memoryStore = rememberCustomerOutcome(
      state.memoryStore,
      state.analysis.customer.id,
      memoryWrite
    );
    saveMemoryStore(state.memoryStore);
    state.approvedAnalyses = [state.analysis, ...state.approvedAnalyses].slice(0, 4);
    state.visibleStageCount = state.analysis.timeline.length;
    render();
  }

  if (actionName === "set-qwen-mode") {
    state.qwenMode =
      action.dataset.mode === "deterministic-demo" ? "deterministic-demo" : "qwen-live";
    setQwenMode(state.qwenMode);
    state.analysis = null;
    clearGeneratedCreative();
    state.visibleStageCount = 0;
    state.runError = "";
    render();
  }

  if (actionName === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme(state.theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, state.theme);
    } catch {
      // The active theme still works when browser storage is unavailable.
    }
    render();
  }

  if (actionName === "clear-customer-memory") {
    const customerId = getSelectedRfq().customerId;
    state.memoryStore = forgetCustomerOutcomes(state.memoryStore, customerId);
    saveMemoryStore(state.memoryStore);
    state.analysis = null;
    clearGeneratedCreative();
    state.visibleStageCount = 0;
    render();
  }

  if (actionName === "set-view") {
    const view = action.dataset.view as WorkspaceView | undefined;
    if (view) state.selectedView = view;
    if (view !== "voice") stopAgentSpeech();
    state.mobileMenuOpen = false;
    render();
    if (view) focusWorkspaceView();
  }

  if (actionName === "toggle-mobile-menu") {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    render();
  }

  if (actionName === "close-mobile-menu") {
    state.mobileMenuOpen = false;
    render();
  }

  if (actionName === "toggle-voice") {
    if (state.voice.isListening && activeVoiceCaptureTarget === "rfq") {
      stopVoiceInput();
    } else {
      stopVoiceInput({ discard: true });
      await startVoiceInput("rfq");
    }
  }

  if (actionName === "toggle-voice-agent") {
    if (state.voice.isListening && activeVoiceCaptureTarget === "customer-agent") {
      stopVoiceInput();
    } else {
      stopAgentSpeech();
      stopVoiceInput({ discard: true });
      await startVoiceInput("customer-agent");
    }
  }

  if (actionName === "toggle-voice-transcript") {
    state.voiceAgent.transcriptExpanded = !state.voiceAgent.transcriptExpanded;
    render();
  }

  if (actionName === "clear-voice-attachment") {
    state.voiceAgent.attachment = null;
    render();
  }

  if (actionName === "end-voice-session") {
    stopVoiceInput({ discard: true });
    stopAgentSpeech();
    resetVoiceAgentConversation();
    state.voice.status = state.serviceHealth.speechConfigured
      ? "Qwen ASR ready"
      : "Voice session ended";
    render();
  }

  if (actionName === "send-voice-agent") {
    await sendCustomerAgentMessage(state.voiceAgent.draft);
  }

  if (actionName === "voice-agent-suggestion" && action.dataset.message) {
    await sendCustomerAgentMessage(action.dataset.message);
  }

  if (actionName === "play-agent-message" && action.dataset.messageId) {
    await playAgentMessage(action.dataset.messageId);
  }

  if (actionName === "stop-agent-audio") {
    stopAgentSpeech();
    render();
  }

  if (actionName === "reset-rfq") {
    stopVoiceInput({ discard: true });
    delete state.rfqDrafts[state.selectedRfqId];
    state.analysis = null;
    clearGeneratedCreative();
    render();
  }

  if (actionName === "clear-media") {
    state.productMedia = null;
    clearGeneratedCreative();
    render();
  }

  if (actionName === "generate-creative") {
    await generateMarketingCreative();
  }

  if (actionName === "generate-product-video") {
    await generateProductVideo();
  }
});

app.addEventListener("input", (event) => {
  const field = (event.target as Element | null)?.closest<HTMLInputElement | HTMLTextAreaElement>(
    "[data-field], [data-seller-field]"
  );
  if (!field) return;

  const sellerField = field.dataset.sellerField;
  if (sellerField && isSellerTextField(sellerField)) {
    updateSellerTextField(sellerField, field.value);
    state.sellerIntake.error = "";
  }

  if (sellerField === "ownershipConfirmed" && field instanceof HTMLInputElement) {
    state.sellerIntake.draft.ownershipConfirmed = field.checked;
    state.sellerIntake.error = "";
    render();
    return;
  }

  if (field.dataset.field === "seller-ai-message") {
    state.sellerIntake.ai.draft = field.value;
    state.sellerIntake.ai.error = "";
    const sendButton = app.querySelector<HTMLButtonElement>(
      "[data-action='send-seller-intake']"
    );
    if (sendButton) {
      sendButton.disabled = !field.value.trim() || state.sellerIntake.ai.isThinking;
    }
  }

  if (field.dataset.field === "rfq-message") {
    state.rfqDrafts[state.selectedRfqId] = field.value;
    state.analysis = null;
    clearGeneratedCreative();
  }

  if (field.dataset.field === "voice-agent-message") {
    state.voiceAgent.draft = field.value;
    state.voiceAgent.error = "";
  }
});

app.addEventListener("change", async (event) => {
  const field = (event.target as Element | null)?.closest<HTMLInputElement>(
    "[data-field], [data-seller-field]"
  );
  if (!field) return;

  if (field.dataset.sellerField === "sellerPhoto") {
    await handleSellerPhoto(field.files?.[0]);
    field.value = "";
  }

  if (field.dataset.field === "product-media") {
    await handleMediaUpload(field.files?.[0]);
  }

  if (
    field.dataset.field === "voice-agent-camera" ||
    field.dataset.field === "voice-agent-attachment"
  ) {
    await handleVoiceAgentAttachment(field.files?.[0]);
    field.value = "";
  }
});

app.addEventListener("submit", async (event) => {
  const form = (event.target as Element | null)?.closest<HTMLFormElement>(
    "[data-form='seller-intake']"
  );
  if (!form) return;

  event.preventDefault();
  if (!form.reportValidity()) return;
  await saveSellerListing();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.sellerIntake.open && !state.sellerIntake.isSaving) {
    if (activeVoiceCaptureTarget === "seller-intake") stopVoiceInput({ discard: true });
    state.sellerIntake.open = false;
    state.sellerIntake.error = "";
    render();
    return;
  }

  const sellerAiTarget = event.target as HTMLTextAreaElement | null;
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    sellerAiTarget?.dataset.field === "seller-ai-message"
  ) {
    event.preventDefault();
    void sendSellerIntakeMessage(sellerAiTarget.value);
    return;
  }

  if (event.key === "Escape" && state.mobileMenuOpen) {
    state.mobileMenuOpen = false;
    render();
  }

  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    target?.dataset.field === "voice-agent-message"
  ) {
    event.preventDefault();
    void sendCustomerAgentMessage(target.value);
  }
});

async function runSelectedRfq(): Promise<void> {
  state.isRunning = true;
  state.analysis = null;
  clearGeneratedCreative();
  state.visibleStageCount = 0;
  state.runError = "";
  render();

  const rfq = getSelectedRfq();
  const startedAt = performance.now();

  try {
    state.analysis = await runAutopilot(rfq, { customer: getCustomer(rfq.customerId) });
    state.analysis.executionProof.elapsedMs = Math.round(performance.now() - startedAt);

    for (let index = 1; index <= state.analysis.timeline.length; index += 1) {
      state.visibleStageCount = index;
      render();
      await wait(220);
    }
  } catch (error) {
    state.runError = toError(error).message || "The autopilot could not complete this RFQ.";
  } finally {
    state.isRunning = false;
    render();
  }
}

async function bootstrapServiceHealth(): Promise<void> {
  try {
    const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Health endpoint unavailable");
    const payload = (await response.json()) as {
      qwen?: {
        configured?: boolean;
        model?: string;
        speechConfigured?: boolean;
        speechModel?: string;
        agentModel?: string;
        ttsConfigured?: boolean;
        ttsModel?: string;
        ttsVoice?: string;
        voiceDesignModel?: string;
        visionModel?: string;
        imageModel?: string;
        imageFallbackModel?: string;
        videoConfigured?: boolean;
        videoModel?: string;
      };
    };
    state.serviceHealth = {
      status: "online",
      configured: Boolean(payload.qwen?.configured),
      model: payload.qwen?.model || "qwen3.7-plus",
      speechConfigured: Boolean(payload.qwen?.speechConfigured),
      speechModel: payload.qwen?.speechModel || "qwen3-asr-flash",
      agentModel: payload.qwen?.agentModel || "qwen3.7-plus",
      ttsConfigured: Boolean(payload.qwen?.ttsConfigured),
      ttsModel: payload.qwen?.ttsModel || "qwen3-tts-vd-2026-01-26",
      ttsVoice: payload.qwen?.ttsVoice || "",
      voiceDesignModel: payload.qwen?.voiceDesignModel || "qwen-voice-design",
      visionModel: payload.qwen?.visionModel || "qwen3.7-plus",
      imageModel: payload.qwen?.imageModel || "wan2.7-image-pro",
      imageFallbackModel: payload.qwen?.imageFallbackModel || "qwen-image-2.0-pro",
      videoConfigured: Boolean(payload.qwen?.videoConfigured),
      videoModel: payload.qwen?.videoModel || "happyhorse-1.0-i2v"
    };
  } catch {
    state.serviceHealth = {
      status: "offline",
      configured: false,
      model: "qwen3.7-plus",
      speechConfigured: false,
      speechModel: "qwen3-asr-flash",
      agentModel: "qwen3.7-plus",
      ttsConfigured: false,
      ttsModel: "qwen3-tts-vd-2026-01-26",
      ttsVoice: "",
      voiceDesignModel: "qwen-voice-design",
      visionModel: "qwen3.7-plus",
      imageModel: "wan2.7-image-pro",
      imageFallbackModel: "qwen-image-2.0-pro",
      videoConfigured: false,
      videoModel: "happyhorse-1.0-i2v"
    };
  }

  if (!state.voice.isListening && !state.voice.isTranscribing) {
    state.voice.status = state.serviceHealth.speechConfigured
      ? "Qwen ASR ready"
      : SpeechRecognition
        ? "Browser full-phrase STT ready"
        : "Microphone transcription unavailable";
  }
  render();
}

async function bootstrapListings(): Promise<void> {
  try {
    const response = await fetch("/api/listings", {
      headers: { Accept: "application/json" }
    });
    const payload = (await response.json()) as ListingApiResponse;
    if (!response.ok || !payload.ok || !Array.isArray(payload.listings)) {
      throw new Error(payload.error || "Saved listings are unavailable.");
    }

    state.listings.items = payload.listings;
    state.listings.status = "ready";
    state.listings.error = "";

  } catch (error) {
    state.listings.status = "error";
    state.listings.error = toError(error).message;
  }

  render();
}

async function selectRfq(rfqId: string): Promise<void> {
  stopVoiceInput({ discard: true });
  stopAgentSpeech();
  state.mobileMenuOpen = false;
  state.selectedRfqId = rfqId;
  if (rfqScenarios.some((rfq) => rfq.id === rfqId) && !FLAGSHIP_RFQ_IDS.has(rfqId)) {
    state.examplesExpanded = true;
  }
  state.analysis = null;
  state.productMedia = null;
  state.listingNotice = "";
  clearGeneratedCreative();
  state.visibleStageCount = 0;
  state.isRunning = false;
  resetVoiceAgentConversation();

  const listing = getSelectedListing();
  if (listing) {
    try {
      state.productMedia = await loadListingMedia(listing);
    } catch (error) {
      state.listingNotice = `The listing is saved, but its photo could not be loaded: ${toError(error).message}`;
    }
  } else if (FLAGSHIP_RFQ_IDS.has(rfqId)) {
    try {
      state.productMedia = await loadFlagshipMedia();
    } catch (error) {
      state.listingNotice = `The demo request is ready, but its product photo could not be loaded: ${toError(error).message}`;
    }
  }

  render();
}

async function bootstrapFlagshipMedia(): Promise<void> {
  if (!FLAGSHIP_RFQ_IDS.has(state.selectedRfqId) || state.productMedia) return;

  try {
    state.productMedia = await loadFlagshipMedia();
  } catch (error) {
    state.listingNotice = `The demo request is ready, but its product photo could not be loaded: ${toError(error).message}`;
  }
  render();
}

async function loadFlagshipMedia(): Promise<UploadedMedia> {
  const response = await fetch(FLAGSHIP_MEDIA_URL, {
    headers: { Accept: "image/png" }
  });
  if (!response.ok) throw new Error(`Demo image returned ${response.status}`);
  const blob = await response.blob();

  return {
    fileName: "mongolian-cashmere-scarves.png",
    mimeType: blob.type || "image/png",
    sizeBytes: blob.size,
    dataUrl: await readFileAsDataUrl(blob)
  };
}

async function sendSellerIntakeMessage(rawMessage: string): Promise<void> {
  const message = rawMessage.trim();
  if (!message || state.sellerIntake.ai.isThinking) return;

  const previousHistory = state.sellerIntake.ai.messages;
  state.sellerIntake.ai.messages = [
    ...previousHistory,
    { role: "user", content: message }
  ];
  state.sellerIntake.ai.draft = "";
  state.sellerIntake.ai.isThinking = true;
  state.sellerIntake.ai.error = "";
  state.sellerIntake.error = "";
  render();

  try {
    const response = await fetch("/api/seller-intake-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: previousHistory,
        currentFields: sellerDraftToAiFields(state.sellerIntake.draft)
      })
    });
    const payload = (await response.json()) as SellerIntakeAssistantApiResponse;
    if (!response.ok || !payload.ok || !payload.answer) {
      throw new Error(payload.error || `Seller assistant returned ${response.status}`);
    }

    applyAiFieldsToSellerDraft(payload.answer.fields);
    state.sellerIntake.ai.messages = [
      ...state.sellerIntake.ai.messages,
      { role: "assistant", content: payload.answer.reply }
    ];
    state.sellerIntake.ai.missingFields = getMissingSellerFields(state.sellerIntake.draft);
    state.sellerIntake.ai.confidence = payload.answer.confidence;
    state.sellerIntake.ai.trace = payload.trace || null;
  } catch (error) {
    state.sellerIntake.ai.error = toError(error).message;
  } finally {
    state.sellerIntake.ai.isThinking = false;
    render();
  }
}

function sellerDraftToAiFields(draft: SellerIntakeDraft): SellerIntakeAiFields {
  return {
    sellerName: draft.sellerName || null,
    sellerEmail: draft.sellerEmail || null,
    sellerLocation: draft.sellerLocation || null,
    targetMarket: draft.targetMarket || null,
    brand: draft.brand || null,
    model: draft.model || null,
    category: draft.category || null,
    condition: draft.condition || null,
    color: draft.color || null,
    material: draft.material || null,
    manufactureYear: optionalDraftNumber(draft.manufactureYear),
    askingPriceUsd: optionalDraftNumber(draft.askingPriceUsd),
    desiredSaleDays: optionalDraftNumber(draft.desiredSaleDays),
    description: draft.description || null,
    authenticityNotes: draft.authenticityNotes || null
  };
}

function applyAiFieldsToSellerDraft(fields: SellerIntakeAiFields): void {
  const draft = state.sellerIntake.draft;
  if (fields.sellerName) draft.sellerName = fields.sellerName;
  if (fields.sellerEmail) draft.sellerEmail = fields.sellerEmail;
  if (fields.sellerLocation) draft.sellerLocation = fields.sellerLocation;
  if (fields.targetMarket) draft.targetMarket = fields.targetMarket;
  if (fields.brand) draft.brand = fields.brand;
  if (fields.model) draft.model = fields.model;
  if (fields.category) draft.category = fields.category;
  if (fields.condition) draft.condition = fields.condition;
  if (fields.color) draft.color = fields.color;
  if (fields.material) draft.material = fields.material;
  if (fields.manufactureYear) draft.manufactureYear = String(fields.manufactureYear);
  if (fields.askingPriceUsd) draft.askingPriceUsd = String(fields.askingPriceUsd);
  if (fields.desiredSaleDays) draft.desiredSaleDays = String(fields.desiredSaleDays);
  if (fields.description) draft.description = fields.description;
  if (fields.authenticityNotes) draft.authenticityNotes = fields.authenticityNotes;
}

function optionalDraftNumber(value: string): number | null {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? number : null;
}

function getMissingSellerFields(draft: SellerIntakeDraft): SellerIntakeFieldName[] {
  const fields = sellerDraftToAiFields(draft);
  return SELLER_REQUIRED_AI_FIELDS.filter((field) => {
    const value = fields[field];
    return value === null || value === "";
  });
}

function sellerFieldLabel(field: SellerIntakeFieldName): string {
  const labels: Record<SellerIntakeFieldName, string> = {
    sellerName: "seller name",
    sellerEmail: "email",
    sellerLocation: "item location",
    targetMarket: "target market",
    brand: "brand",
    model: "model",
    category: "category",
    condition: "condition",
    color: "color",
    material: "material",
    manufactureYear: "year",
    askingPriceUsd: "asking price",
    desiredSaleDays: "sale timeline",
    description: "description",
    authenticityNotes: "verification or provenance notes"
  };
  return labels[field];
}

async function saveSellerListing(): Promise<void> {
  if (state.sellerIntake.isSaving) return;
  const missingFields = getMissingSellerFields(state.sellerIntake.draft);
  if (missingFields.length) {
    const message = `Complete ${missingFields.slice(0, 3).map(sellerFieldLabel).join(", ")}${missingFields.length > 3 ? ` and ${missingFields.length - 3} more` : ""} before saving.`;
    if (state.sellerIntake.mode === "ai") state.sellerIntake.ai.error = message;
    else state.sellerIntake.error = message;
    render();
    return;
  }
  if (!state.sellerIntake.photo) {
    state.sellerIntake.error = "Add one clear photo of the item before saving.";
    render();
    return;
  }

  const draft = state.sellerIntake.draft;
  const uploadedPhoto = state.sellerIntake.photo;
  if (!draft.targetMarket || !draft.category || !draft.condition) {
    state.sellerIntake.error = "Choose a target market, category, and condition before saving.";
    render();
    return;
  }

  const input: CreateSellerListingInput = {
    sellerName: draft.sellerName,
    sellerEmail: draft.sellerEmail,
    sellerLocation: draft.sellerLocation,
    targetMarket: draft.targetMarket,
    brand: draft.brand,
    model: draft.model,
    category: draft.category,
    condition: draft.condition,
    color: draft.color,
    material: draft.material,
    manufactureYear: draft.manufactureYear ? Number(draft.manufactureYear) : null,
    askingPriceUsd: Number(draft.askingPriceUsd),
    desiredSaleDays: Number(draft.desiredSaleDays),
    description: draft.description,
    authenticityNotes: draft.authenticityNotes,
    ownershipConfirmed: draft.ownershipConfirmed,
    photo: uploadedPhoto
  };

  state.sellerIntake.isSaving = true;
  state.sellerIntake.error = "";
  render();

  try {
    const response = await fetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    const payload = (await response.json()) as ListingApiResponse;
    if (!response.ok || !payload.ok || !payload.listing) {
      throw new Error(payload.error || `Listing service returned ${response.status}`);
    }

    state.listings.items = [
      payload.listing,
      ...state.listings.items.filter((listing) => listing.id !== payload.listing!.id)
    ];
    state.listings.status = "ready";
    state.selectedRfqId = listingScenarioId(payload.listing.id);
    state.productMedia = uploadedPhoto;
    state.analysis = null;
    state.visibleStageCount = 0;
    state.selectedView = "workbench";
    state.listingNotice = `${payload.listing.brand} ${payload.listing.model} is saved in your private listing database.`;
    clearGeneratedCreative();
    state.sellerIntake = createSellerIntakeState();
    render();
  } catch (error) {
    state.sellerIntake.isSaving = false;
    state.sellerIntake.error = toError(error).message;
    render();
  }
}

async function deleteSellerListing(listing: SellerListing): Promise<void> {
  const confirmed = window.confirm(
    `Delete ${listing.brand} ${listing.model}? This removes its saved details and photo.`
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/listings/${encodeURIComponent(listing.id)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" }
    });
    const payload = (await response.json()) as ListingApiResponse;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "The listing could not be deleted.");
    }

    state.listings.items = state.listings.items.filter((item) => item.id !== listing.id);
    const nextListing = state.listings.items[0];
    await selectRfq(nextListing ? listingScenarioId(nextListing.id) : SELLER_ONBOARDING_ID);
  } catch (error) {
    state.listingNotice = toError(error).message;
    render();
  }
}

async function handleSellerPhoto(file: File | undefined): Promise<void> {
  if (!file) return;

  try {
    state.sellerIntake.photo = await readValidatedImage(file);
    state.sellerIntake.error = "";
  } catch (error) {
    state.sellerIntake.photo = null;
    state.sellerIntake.error = toError(error).message;
  }
  render();
}

async function loadListingMedia(listing: SellerListing): Promise<UploadedMedia> {
  const response = await fetch(listing.photo.url, { headers: { Accept: listing.photo.mimeType } });
  if (!response.ok) throw new Error(`Photo service returned ${response.status}`);
  const blob = await response.blob();

  return {
    fileName: listing.photo.fileName,
    mimeType: listing.photo.mimeType,
    sizeBytes: listing.photo.sizeBytes,
    dataUrl: await readFileAsDataUrl(blob)
  };
}

async function generateMarketingCreative(): Promise<void> {
  if (!state.productMedia || state.isGeneratingCreative) return;

  if (!state.analysis) {
    state.creativeError = "Run the autopilot first so the creative uses the current product and quote.";
    render();
    return;
  }

  const generationRevision = ++activeCreativeGenerationRevision;
  invalidateProductVideo();
  state.marketingAsset = null;
  state.marketingTrace = null;
  state.isGeneratingCreative = true;
  state.creativeError = "";
  render();

  try {
    const rfq = getSelectedRfq();
    const customer = getCustomer(rfq.customerId);
    const selectedProduct = state.analysis.selectedProduct.product || products[0];
    const response = await fetch("/api/generate-marketing-asset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        media: state.productMedia,
        rfq,
        customer,
        product: selectedProduct,
        quote: state.analysis?.quote || null
      })
    });
    const payload = (await response.json()) as CreativeApiResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Creative service returned ${response.status}`);
    }

    if (generationRevision !== activeCreativeGenerationRevision) return;
    if (!payload.asset || !payload.trace) throw new Error("Creative response was incomplete");
    state.marketingAsset = payload.asset;
    state.marketingTrace = payload.trace;
  } catch (error) {
    if (generationRevision !== activeCreativeGenerationRevision) return;
    const failure = toError(error);
    state.creativeError = failure.message;
    state.marketingTrace = {
      status: "error",
      error: failure.message
    };
  } finally {
    if (generationRevision === activeCreativeGenerationRevision) {
      state.isGeneratingCreative = false;
      render();
    }
  }
}

async function generateProductVideo(): Promise<void> {
  if (state.isGeneratingVideo) return;

  const firstFrame = getProductVideoFirstFrame();
  if (!firstFrame) {
    state.videoError = "HappyHorse needs a PNG, JPEG, or WebP product frame.";
    render();
    return;
  }

  const generationRevision = ++activeVideoGenerationRevision;
  const prompt = buildProductVideoPrompt();
  const resolution: ProductVideoAsset["resolution"] = "720P";
  const duration = 5;
  const deadline = Date.now() + 240_000;
  state.productVideo = null;
  state.videoTrace = null;
  state.videoError = "";
  state.isGeneratingVideo = true;
  render();

  try {
    const response = await fetch("/api/product-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media: firstFrame, prompt, resolution, duration })
    });
    const payload = (await response.json()) as ProductVideoApiResponse;
    if (!response.ok || !payload.ok || !payload.asset || !payload.trace) {
      throw new Error(payload.error || `HappyHorse service returned ${response.status}`);
    }
    if (generationRevision !== activeVideoGenerationRevision) return;

    state.productVideo = payload.asset;
    state.videoTrace = payload.trace;
    render();

    while (
      state.productVideo.status !== "SUCCEEDED" &&
      state.productVideo.status !== "FAILED" &&
      Date.now() < deadline
    ) {
      await wait(15_000);
      if (generationRevision !== activeVideoGenerationRevision) return;

      const statusResponse = await fetch(
        `/api/product-video-status?taskId=${encodeURIComponent(state.productVideo.taskId)}`,
        { headers: { Accept: "application/json" } }
      );
      const statusPayload = (await statusResponse.json()) as ProductVideoApiResponse;
      if (!statusResponse.ok || !statusPayload.ok || !statusPayload.asset || !statusPayload.trace) {
        throw new Error(statusPayload.error || `HappyHorse status returned ${statusResponse.status}`);
      }

      state.productVideo = {
        ...statusPayload.asset,
        prompt: statusPayload.asset.prompt || prompt,
        resolution,
        duration
      };
      state.videoTrace = statusPayload.trace;
      render();
    }

    if (state.productVideo.status === "FAILED") {
      throw new Error(state.productVideo.error || "HappyHorse could not render this product video.");
    }
    if (state.productVideo.status !== "SUCCEEDED") {
      throw new Error("HappyHorse is still processing after four minutes. Start a new render to retry.");
    }
  } catch (error) {
    if (generationRevision !== activeVideoGenerationRevision) return;
    const failure = toError(error);
    state.videoError = failure.message;
    state.videoTrace = {
      status: "error",
      model: state.serviceHealth.videoModel,
      error: failure.message
    };
  } finally {
    if (generationRevision === activeVideoGenerationRevision) {
      state.isGeneratingVideo = false;
      render();
    }
  }
}

function getProductVideoFirstFrame(): UploadedMedia | null {
  const asset = state.marketingAsset;
  if (
    asset &&
    isHappyHorseImageType(asset.mimeType) &&
    /^data:image\/(?:png|jpe?g|webp);base64,/i.test(asset.imageDataUrl)
  ) {
    return {
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: estimateDataUrlBytes(asset.imageDataUrl),
      dataUrl: asset.imageDataUrl
    };
  }

  return state.productMedia && isHappyHorseImageType(state.productMedia.mimeType)
    ? state.productMedia
    : null;
}

function buildProductVideoPrompt(): string {
  const rfq = getSelectedRfq();
  const customer = getCustomer(rfq.customerId);
  const product = state.analysis?.selectedProduct.product;
  const visualDirection = state.marketingAsset?.brief.visualPrompt;
  const sellerListing = rfq.source === "seller-listing";

  return [
    sellerListing
      ? `Create a polished five-second resale campaign clip for this product category and buyers in ${customer.market}.`
      : `Create a polished five-second B2B product campaign clip for ${customer.company}.`,
    product ? `Feature the exact ${product.name} (${product.sku}).` : `Feature the exact product in the source image.`,
    visualDirection || (sellerListing
      ? "Use refined editorial lighting and a premium authenticated-resale setting."
      : "Use clean commercial studio lighting and a premium export-catalog setting."),
    "Use a slow camera push-in with subtle natural parallax and restrained light movement.",
    "Preserve the product shape, materials, colors, labels, logo, and proportions exactly.",
    "Do not morph the product, add hands, invent accessories, or render new text."
  ].join(" ");
}

function isHappyHorseImageType(mimeType: string): boolean {
  return /^(?:image\/png|image\/jpeg|image\/webp)$/i.test(mimeType);
}

function estimateDataUrlBytes(dataUrl: string): number {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - (encoded.match(/=*$/)?.[0].length || 0));
}

function clearGeneratedCreative(): void {
  activeCreativeGenerationRevision += 1;
  state.marketingAsset = null;
  state.marketingTrace = null;
  state.creativeError = "";
  state.isGeneratingCreative = false;
  invalidateProductVideo();
}

function invalidateProductVideo(): void {
  activeVideoGenerationRevision += 1;
  state.productVideo = null;
  state.videoTrace = null;
  state.videoError = "";
  state.isGeneratingVideo = false;
}

async function handleMediaUpload(file: File | undefined): Promise<void> {
  if (!file) return;

  try {
    state.productMedia = await readValidatedImage(file);
    clearGeneratedCreative();
  } catch (error) {
    state.creativeError = toError(error).message;
  }
  render();
}

async function handleVoiceAgentAttachment(file: File | undefined): Promise<void> {
  if (!file) return;

  try {
    state.voiceAgent.attachment = await readValidatedImage(file);
    state.voiceAgent.error = "";
  } catch (error) {
    state.voiceAgent.attachment = null;
    state.voiceAgent.error = toError(error).message;
  }
  render();
}

async function readValidatedImage(file: File): Promise<UploadedMedia> {
  if (!isHappyHorseImageType(file.type)) {
    throw new Error("Please use a PNG, JPEG, or WebP image.");
  }
  if (file.size > 5_000_000) {
    throw new Error("Please use an image under 5 MB.");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await readImageDimensions(dataUrl);
  const aspectRatio = dimensions.width / dimensions.height;
  if (dimensions.width < 300 || dimensions.height < 300) {
    throw new Error("Product images must be at least 300 x 300 pixels.");
  }
  if (aspectRatio < 0.4 || aspectRatio > 2.5) {
    throw new Error("Product image aspect ratio must be between 1:2.5 and 2.5:1.");
  }

  return {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    dataUrl
  };
}

async function startVoiceInput(target: VoiceCaptureTarget = "rfq"): Promise<void> {
  state.voice.error = "";
  state.voice.trace = null;
  activeVoiceCaptureTarget = target;

  if (canUseQwenVoice()) {
    await startQwenVoiceRecording(target);
    return;
  }

  startBrowserVoiceInput(target);
}

function canUseQwenVoice(): boolean {
  return Boolean(
      state.serviceHealth.status === "online" &&
      state.serviceHealth.speechConfigured &&
      !preferBrowserVoiceFallback &&
      supportsAudioRecording()
  );
}

async function startQwenVoiceRecording(target: VoiceCaptureTarget): Promise<void> {
  stopVoiceInput({ discard: true });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    const mimeType = preferredAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    activeMediaStream = stream;
    activeMediaRecorder = recorder;
    recordedAudioChunks = [];
    discardActiveRecording = false;

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordedAudioChunks.push(event.data);
    });
    recorder.addEventListener("start", () => {
      state.voice.isListening = true;
      state.voice.isTranscribing = false;
      state.voice.status = target === "customer-agent"
        ? "Listening to customer"
        : target === "seller-intake"
          ? "Listening to your item description"
          : "Recording for Qwen ASR";
      state.voice.provider = state.serviceHealth.speechModel;
      render();
    });
    recorder.addEventListener("stop", () => {
      const chunks = recordedAudioChunks;
      const discard = discardActiveRecording;
      const recordingType = recorder.mimeType || mimeType || "audio/webm";
      const captureTarget = target;

      recordedAudioChunks = [];
      activeMediaRecorder = null;
      releaseMediaStream();

      if (discard) {
        state.voice.isListening = false;
        state.voice.isTranscribing = false;
        state.voice.status = "Qwen voice ready";
        render();
        return;
      }

      void transcribeRecordedAudio(new Blob(chunks, { type: recordingType }), captureTarget);
    });
    recorder.start(500);
  } catch (error) {
    releaseMediaStream();
    state.voice.isListening = false;
    state.voice.isTranscribing = false;
    state.voice.status = SpeechRecognition ? "Browser voice ready" : "Microphone unavailable";
    state.voice.error =
      toError(error).name === "NotAllowedError"
        ? "Microphone permission is blocked."
        : "Could not start microphone recording.";
    render();
  }
}

async function transcribeRecordedAudio(
  audio: Blob,
  target: VoiceCaptureTarget
): Promise<void> {
  if (!audio.size) {
    state.voice.status = "Qwen voice ready";
    state.voice.error = "No speech was recorded.";
    render();
    return;
  }

  if (audio.size > 6_500_000) {
    state.voice.status = "Qwen voice ready";
    state.voice.error = "Voice recording is too long. Keep it under about five minutes.";
    render();
    return;
  }

  state.voice.isListening = false;
  state.voice.isTranscribing = true;
  state.voice.status = "Qwen is transcribing";
  state.voice.error = "";
  render();

  try {
    const response = await fetch("/api/transcribe-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio: {
          dataUrl: await readFileAsDataUrl(audio),
          mimeType: audio.type,
          sizeBytes: audio.size
        },
        languageHint: getCustomer(getSelectedRfq().customerId).language
      })
    });
    const payload = (await response.json()) as TranscriptionApiResponse;

    if (!response.ok || !payload.ok || !payload.transcript) {
      throw new Error(payload.error || `Voice service returned ${response.status}`);
    }

    state.voice.status = `Transcribed by ${payload.trace?.model || state.serviceHealth.speechModel}`;
    state.voice.provider = payload.trace?.model || state.serviceHealth.speechModel;
    state.voice.trace = payload.trace || null;
    preferBrowserVoiceFallback = false;
    if (target === "customer-agent") {
      await sendCustomerAgentMessage(payload.transcript);
    } else if (target === "seller-intake") {
      await sendSellerIntakeMessage(payload.transcript);
    } else {
      appendTranscript(payload.transcript);
    }
  } catch (error) {
    preferBrowserVoiceFallback = Boolean(SpeechRecognition);
    state.voice.trace = null;
    state.voice.status = SpeechRecognition ? "Browser fallback ready" : "Qwen voice unavailable";
    state.voice.error = `${toError(error).message}${SpeechRecognition ? " Use the mic again for browser fallback if Qwen remains unavailable." : ""}`;
  } finally {
    state.voice.isTranscribing = false;
    render();
  }
}

function startBrowserVoiceInput(target: VoiceCaptureTarget): void {
  if (!SpeechRecognition) {
    state.voice.status = "Not supported";
    state.voice.error = "This browser cannot record or transcribe speech.";
    render();
    return;
  }

  stopVoiceInput({ discard: true });
  const rfq = getSelectedRfq();
  const customer = getCustomer(rfq.customerId);
  const recognition = new SpeechRecognition();
  const transcript = new SpeechTranscriptAccumulator();
  const session: BrowserRecognitionSession = { recognition, discard: false };
  activeRecognitionSession = session;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = speechLanguageFor(customer);

  recognition.onstart = () => {
    state.voice.isListening = true;
    state.voice.isTranscribing = false;
    state.voice.status = target === "customer-agent"
      ? "Listening in browser"
      : target === "seller-intake"
        ? "Listening to your item description"
        : "Browser speech fallback";
    state.voice.error = "";
    state.voice.provider = "Browser SpeechRecognition";
    render();
  };

  recognition.onresult = (event) => {
    transcript.accept(event);
    const preview = transcript.text;
    state.voice.status = preview
      ? `Listening: ${preview.slice(-72)}`
      : target === "customer-agent"
        ? "Listening to customer"
        : target === "seller-intake"
          ? "Listening to seller"
          : "Listening to request";
    render();
  };

  recognition.onerror = (event) => {
    state.voice.error = event.error === "not-allowed" ? "Microphone permission is blocked." : event.error;
    state.voice.status = "Stopped";
    state.voice.isListening = false;
    render();
  };

  recognition.onend = () => {
    if (activeRecognitionSession !== session) return;
    activeRecognitionSession = null;
    state.voice.isListening = false;
    if (session.discard) {
      state.voice.status = "Browser voice ready";
      render();
      return;
    }

    const completedTranscript = transcript.finalText || transcript.text;
    if (!completedTranscript) {
      state.voice.status = "Browser voice ready";
      state.voice.error = "No speech was recognized. Hold the mic until you finish speaking.";
      render();
      return;
    }

    state.voice.status = "Full phrase captured";
    render();
    if (target === "customer-agent") {
      void sendCustomerAgentMessage(completedTranscript);
    } else if (target === "seller-intake") {
      void sendSellerIntakeMessage(completedTranscript);
    } else {
      appendTranscript(completedTranscript);
    }
  };

  recognition.start();
}

function stopVoiceInput({ discard = false }: { discard?: boolean } = {}): void {
  if (activeMediaRecorder && activeMediaRecorder.state !== "inactive") {
    discardActiveRecording = discard;
    activeMediaRecorder.stop();
  }

  if (activeRecognitionSession) {
    activeRecognitionSession.discard = discard;
    activeRecognitionSession.recognition.stop();
  }

  state.voice.isListening = false;
}

function releaseMediaStream(): void {
  activeMediaStream?.getTracks().forEach((track) => track.stop());
  activeMediaStream = null;
}

function preferredAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function supportsAudioRecording(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function appendTranscript(transcript: string): void {
  const current = getRfqDraft(getSelectedRfqBase()).trim();
  const next = current ? `${current} ${transcript}` : transcript;
  state.rfqDrafts[state.selectedRfqId] = next;
  state.analysis = null;
  clearGeneratedCreative();
  render();
}

function resetVoiceAgentConversation(): void {
  state.voiceAgent = {
    messages: [
      {
        id: "voice-welcome",
        role: "assistant",
        content:
          "Hello, I’m the QuoteX customer assistant. I can explain this request, quote status, delivery plan, product details, and payment terms. Final commercial decisions always stay with a person.",
        voiceMode: "text-only"
      }
    ],
    draft: "",
    attachment: null,
    transcriptExpanded: false,
    isThinking: false,
    isSpeaking: false,
    speakingMessageId: "",
    error: ""
  };
}

async function sendCustomerAgentMessage(rawMessage: string): Promise<void> {
  const message = rawMessage.replace(/\s+/g, " ").trim();
  if (!message || state.voiceAgent.isThinking) return;

  stopAgentSpeech();
  const attachment = state.voiceAgent.attachment;
  const userMessage: VoiceAgentMessage = {
    id: createMessageId("customer"),
    role: "user",
    content: message,
    attachment: attachment || undefined
  };
  state.voiceAgent.messages.push(userMessage);
  state.voiceAgent.draft = "";
  state.voiceAgent.attachment = null;
  state.voiceAgent.isThinking = true;
  state.voiceAgent.error = "";
  render();

  try {
    const rfq = getSelectedRfq();
    const customer = getCustomer(rfq.customerId);
    const response = await fetch("/api/customer-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: state.voiceAgent.messages.slice(-9, -1).map(({ role, content }) => ({
          role,
          content
        })),
        context: {
          customer,
          rfq,
          analysis: state.analysis
            ? {
                id: state.analysis.id,
                approval: state.analysis.approval,
                selectedProduct: state.analysis.selectedProduct,
                quote: state.analysis.quote,
                shipping: state.analysis.shipping,
                risks: state.analysis.risks
              }
            : null
        },
        attachment
      })
    });
    const payload = (await response.json()) as CustomerAgentApiResponse;

    if (!response.ok || !payload.ok || !payload.answer) {
      throw new Error(payload.error || `Customer agent returned ${response.status}`);
    }

    state.serviceHealth.status = "online";
    const assistantMessage: VoiceAgentMessage = {
      id: createMessageId("assistant"),
      role: "assistant",
      content: payload.answer.reply,
      trace: payload.trace || null,
      voiceMode: "text-only",
      suggestedActions: payload.answer.suggestedActions,
      needsHuman: payload.answer.needsHuman,
      intent: payload.answer.intent
    };
    state.voiceAgent.messages.push(assistantMessage);
    state.voiceAgent.isThinking = false;
    render();

    await synthesizeAgentMessage(assistantMessage.id, customer.language, true);
  } catch (error) {
    state.voiceAgent.isThinking = false;
    state.voiceAgent.error = toError(error).message || "Customer support could not answer.";
    state.serviceHealth.status = "offline";
    render();
  }
}

async function synthesizeAgentMessage(
  messageId: string,
  language: string,
  autoplay: boolean
): Promise<void> {
  const message = state.voiceAgent.messages.find((candidate) => candidate.id === messageId);
  if (!message || message.role !== "assistant") return;

  try {
    const response = await fetch("/api/synthesize-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.content, language })
    });
    const payload = (await response.json()) as SpeechSynthesisApiResponse;

    if (!response.ok || !payload.ok || !payload.audioDataUrl) {
      throw new Error(payload.error || `Speech service returned ${response.status}`);
    }

    message.audioDataUrl = payload.audioDataUrl;
    message.ttsTrace = payload.trace || null;
    message.voiceMode = "cloud-tts";
    message.voiceProvider = payload.provider || "Cloud TTS";
    message.voiceName = payload.voice || state.serviceHealth.ttsVoice;
    render();

    if (autoplay) await playAgentMessage(messageId);
  } catch (error) {
    const messageText = toError(error).message;
    message.ttsTrace = {
      status: "error",
      model: state.serviceHealth.ttsModel,
      voiceDesignModel: state.serviceHealth.voiceDesignModel,
      error: messageText
    };
    message.voiceMode = "text-only";
    message.voiceProvider = "Qwen designed voice unavailable";
    message.voiceName = state.serviceHealth.ttsVoice;
    state.voiceAgent.error = `Qwen Voice Design could not synthesize this response: ${messageText}`;
    render();
  }
}

async function playAgentMessage(messageId: string): Promise<void> {
  const message = state.voiceAgent.messages.find((candidate) => candidate.id === messageId);
  if (!message || message.role !== "assistant") return;

  stopAgentSpeech();
  if (!message.audioDataUrl) {
    await synthesizeAgentMessage(
      messageId,
      getCustomer(getSelectedRfq().customerId).language,
      true
    );
    return;
  }

  const audio = new Audio(message.audioDataUrl);
  activeAgentAudio = audio;
  state.voiceAgent.isSpeaking = true;
  state.voiceAgent.speakingMessageId = message.id;
  state.voiceAgent.error = "";
  audio.addEventListener("ended", () => {
    if (activeAgentAudio === audio) activeAgentAudio = null;
    state.voiceAgent.isSpeaking = false;
    state.voiceAgent.speakingMessageId = "";
    render();
  });
  audio.addEventListener("error", () => {
    if (activeAgentAudio === audio) activeAgentAudio = null;
    state.voiceAgent.isSpeaking = false;
    state.voiceAgent.speakingMessageId = "";
    state.voiceAgent.error = "The generated voice could not be played.";
    render();
  });
  render();

  try {
    await audio.play();
  } catch {
    stopAgentSpeech();
    state.voiceAgent.error = "Select replay to hear the response.";
    render();
  }
}

function stopAgentSpeech(): void {
  if (activeAgentAudio) {
    activeAgentAudio.pause();
    activeAgentAudio.currentTime = 0;
    activeAgentAudio = null;
  }
  state.voiceAgent.isSpeaking = false;
  state.voiceAgent.speakingMessageId = "";
}

function createMessageId(prefix: string): string {
  const random = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function render(): void {
  const selectedRfq = getSelectedRfq();
  const selectedListing = getSelectedListing();
  const isSellerOnboarding = selectedRfq.id === SELLER_ONBOARDING_ID;
  const customer = getCustomer(selectedRfq.customerId);
  const isFlagship = FLAGSHIP_RFQ_IDS.has(selectedRfq.id);
  const progress = state.analysis
    ? Math.round((state.visibleStageCount / state.analysis.timeline.length) * 100)
    : 0;
  const learnedMemoryCount = state.memoryStore[customer.id]?.length || 0;

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="./" aria-label="QuoteX home">
        <img src="./assets/quotepilot-mark.svg" alt="" width="36" height="36" />
        <span>
          <strong>QuoteX</strong>
          <small>Cross-border commerce autopilot</small>
        </span>
      </a>
      <div class="topbar__controls">
        <div class="mode-switch" aria-label="Inference mode">
          <button class="${state.qwenMode === "qwen-live" ? "is-active" : ""}" data-action="set-qwen-mode" data-mode="qwen-live">Live Qwen</button>
          <button class="${state.qwenMode === "deterministic-demo" ? "is-active" : ""}" data-action="set-qwen-mode" data-mode="deterministic-demo">Resilient demo</button>
        </div>
        ${renderServiceStatus()}
        <button
          class="theme-toggle"
          data-action="toggle-theme"
          aria-label="Switch to ${state.theme === "dark" ? "light" : "dark"} mode"
          title="Switch to ${state.theme === "dark" ? "light" : "dark"} mode"
        >
          ${icon(state.theme === "dark" ? "sun" : "moon")}
          <span>${state.theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
      <button
        class="menu-toggle ${state.mobileMenuOpen ? "is-open" : ""}"
        data-action="toggle-mobile-menu"
        aria-label="${state.mobileMenuOpen ? "Close" : "Open"} navigation menu"
        aria-expanded="${state.mobileMenuOpen}"
        aria-controls="mobile-navigation"
      >
        ${icon(state.mobileMenuOpen ? "close" : "menu")}
      </button>
    </header>

    ${renderMobileNavigation()}

    <section class="workflow-intro ${isFlagship ? "workflow-intro--flagship" : ""}" aria-labelledby="workspace-title">
      <div class="workflow-intro__copy">
        <p class="eyebrow">${isFlagship ? "Flagship demo · Ulaanbaatar to Berlin" : "Qwen Cloud commerce agent"}</p>
        <h1 id="workspace-title">${isFlagship ? "Turn one buyer message into an approved export offer" : "Create a cross-border offer"}</h1>
        <p>${
          isFlagship
            ? "A Mongolian cashmere exporter receives a complex wholesale request. QuoteX recalls the buyer, verifies every commercial fact, and stops before the offer is sent."
            : "Describe any product or choose a buyer request. QuoteX checks memory, catalog, price, shipping, and risk before asking you to approve."
        }</p>
      </div>
      <div class="workflow-intro__actions">
        ${
          isFlagship
            ? `<button class="hero-button" data-action="run-flagship-demo" ${state.isRunning ? "disabled" : ""}>
                ${icon("spark")}
                <span>${state.isRunning ? "Building verified offer" : "Run cashmere export demo"}</span>
              </button>`
            : isSellerOnboarding
              ? ""
              : `<button class="hero-button" data-action="run-autopilot" ${state.isRunning ? "disabled" : ""}>
                  ${icon("spark")}
                  <span>${state.isRunning ? "Building offer" : "Run selected request"}</span>
                </button>`
        }
        <button class="hero-secondary-button" data-action="open-seller-intake">
          ${icon("plus")}
          <span>Add your product</span>
        </button>
      </div>
      ${isFlagship ? renderFlagshipSnapshot() : ""}
      <div class="workflow-steps" aria-label="Four-step workflow">
        ${flowStep("1", isFlagship ? "Understand" : "Describe", isFlagship ? "Voice, email, and product photo" : "Voice, text, or photo")}
        ${flowStep("2", isFlagship ? "Verify" : "Plan", isFlagship ? "Memory, catalog, freight, and margin" : "Qwen uses verified tools")}
        ${flowStep("3", isFlagship ? "Approve" : "Review", isFlagship ? "One accountable human decision" : "Offer and campaign draft")}
        ${flowStep("4", isFlagship ? "Prepare" : "Approve", isFlagship ? "Quote, campaign, and channel drafts" : "Nothing sends automatically")}
      </div>
      ${isFlagship ? renderEvaluationStrip() : ""}
    </section>

    <main class="shell">
      <aside class="inbox-panel panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Your workspace</p>
            <h2>Items & requests</h2>
          </div>
          <button class="inbox-add-button" data-action="open-seller-intake" title="Create seller listing" aria-label="Create seller listing">${icon("plus")}</button>
        </div>
        <div class="rfq-list">
          ${renderGuidedDemoGroup()}
          ${renderSellerListingGroup()}
          ${renderExampleRequestGroup()}
        </div>
      </aside>

      <section class="workbench">
        ${
          isSellerOnboarding
            ? renderSellerOnboardingPanel()
            : `
        <div class="control-panel panel">
          <div class="rfq-copy">
            <div class="rfq-copy__title">
              <span class="language-chip">${escapeHtml(customer.market)}</span>
              <h2>${escapeHtml(selectedRfq.subject)}</h2>
            </div>
            <div class="rfq-input-toolbar">
              <label for="rfq-message">02 / ${selectedListing ? "Review seller intake" : "Review buyer request"}</label>
              <div class="rfq-input-toolbar__actions">
                <button
                  class="icon-button ${state.voice.isListening ? "is-active" : ""}"
                  data-action="toggle-voice"
                  title="${state.voice.isListening ? "Stop and transcribe" : "Voice to text"}"
                  aria-label="${state.voice.isListening ? "Stop and transcribe recording" : "Start voice to text"}"
                  ${state.voice.isTranscribing ? "disabled" : ""}
                >
                  ${icon("mic")}
                </button>
                <button class="secondary-button" data-action="reset-rfq">
                  ${icon("reset")}
                  <span>Reset</span>
                </button>
                ${
                  selectedListing
                    ? `<button class="secondary-button secondary-button--danger" data-action="delete-listing">
                        ${icon("trash")}
                        <span>Delete</span>
                      </button>`
                    : ""
                }
              </div>
            </div>
            ${selectedListing ? renderSelectedListingSummary(selectedListing) : ""}
            <textarea id="rfq-message" class="rfq-input" data-field="rfq-message" rows="5">${escapeHtml(
              selectedRfq.rawMessage
            )}</textarea>
            <div class="input-status">
              <span>${escapeHtml(state.voice.status)}</span>
              ${state.voice.trace?.elapsedMs ? `<span>${state.voice.trace.elapsedMs} ms cloud transcription</span>` : ""}
              <span>${learnedMemoryCount} learned outcome${learnedMemoryCount === 1 ? "" : "s"} saved across sessions</span>
              ${state.voice.error ? `<strong>${escapeHtml(state.voice.error)}</strong>` : ""}
            </div>
          </div>
          <div class="control-panel__actions">
            <button class="primary-button" data-action="run-autopilot" ${state.isRunning ? "disabled" : ""}>
              ${icon("play")}
              <span>${state.isRunning ? "Running" : selectedListing ? "Build sale plan" : "Run Autopilot"}</span>
            </button>
            <div class="progress-ring progress-ring--${progressBand(progress)}" aria-label="Run progress">
              <span>${progress}%</span>
            </div>
          </div>
        </div>

        ${state.listingNotice ? renderListingNotice() : ""}
        ${state.runError ? `<div class="run-error" role="alert"><strong>Autopilot stopped safely.</strong><span>${escapeHtml(state.runError)}</span></div>` : ""}
        ${renderQwenRunNotice()}

        <div class="view-tabs" role="tablist" aria-label="Workspace views">
          ${tab("workbench", "1. Request")}
          ${tab("quote", "2. Offer")}
          ${tab("creative", "3. Campaign")}
          ${tab("voice", "Customer assistant")}
          ${tab("trace", "Agent evidence")}
        </div>

        ${state.selectedView === "voice" || state.selectedView === "trace" ? "" : renderExecutionProof(customer)}

        <div class="workspace-grid workspace-grid--${state.selectedView}">
          ${renderActiveView(customer)}
        </div>
        `
        }
      </section>
    </main>
    ${state.sellerIntake.open ? renderSellerIntakeDialog() : ""}
  `;

  if (state.selectedView === "voice") {
    window.requestAnimationFrame(() => {
      const conversation = app.querySelector<HTMLElement>(".voice-conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  }

  if (state.sellerIntake.open && state.sellerIntake.mode === "ai") {
    window.requestAnimationFrame(() => {
      const conversation = app.querySelector<HTMLElement>(".seller-ai-conversation");
      if (conversation) conversation.scrollTop = conversation.scrollHeight;
    });
  }

  window.requestAnimationFrame(alignSelectedViewTab);
}

function focusWorkspaceView(): void {
  alignSelectedViewTab();
  const tabStrip = app.querySelector<HTMLElement>(".view-tabs");
  if (!tabStrip) return;

  const previousScrollBehavior = document.documentElement.style.scrollBehavior;
  document.documentElement.style.scrollBehavior = "auto";
  tabStrip.scrollIntoView({ behavior: "auto", block: "start" });
  document.documentElement.style.scrollBehavior = previousScrollBehavior;
}

function alignSelectedViewTab(): void {
  const tabStrip = app.querySelector<HTMLElement>(".view-tabs");
  const selectedTab = tabStrip?.querySelector<HTMLElement>(".view-tab.is-active");
  if (!tabStrip || !selectedTab) return;

  const centeredLeft = selectedTab.offsetLeft - (tabStrip.clientWidth - selectedTab.offsetWidth) / 2;
  tabStrip.scrollLeft = Math.max(0, centeredLeft);
}

function renderServiceStatus(): string {
  const health = state.serviceHealth;
  const trace = state.analysis?.qwenTrace;
  const runFailed = trace?.status === "error";
  let label = "Connecting";

  if (runFailed) {
    label = "Qwen unavailable";
  } else if (health.status === "online") {
    label = health.configured ? `${health.model} ready` : "Fallback ready";
  } else if (health.status === "offline") {
    label = "Local UI only";
  }

  return `
    <span class="service-status service-status--${runFailed ? "offline" : health.status}" title="${runFailed ? "The last Qwen request failed. The workflow continued with a labeled fallback." : "Qwen service status"}">
      <i aria-hidden="true"></i>
      ${escapeHtml(label)}
    </span>
  `;
}

function renderQwenRunNotice(): string {
  const trace = state.analysis?.qwenTrace;
  const agentRun = state.analysis?.agentRun;
  if (!trace || (trace.status !== "error" && agentRun?.status !== "guarded-fallback")) return "";

  const error = agentRun?.fallbackReason || trace.error || trace.reason || "The Qwen request did not complete.";
  const intentionalDemo = /resilient demo/i.test(error);
  const detail = /quota|payment|free tier/i.test(error)
    ? "The configured Qwen account has no remaining free quota. Verified tools completed the offer and kept the approval gate active."
    : intentionalDemo
      ? "Qwen was intentionally skipped. The same six verified tools completed the offer and kept the approval gate active."
    : "Verified tools completed the offer and kept the approval gate active.";

  return `
    <div class="run-notice" role="status">
      <div>
        <strong>${intentionalDemo ? "Resilient demo completed with verified tools." : "Qwen planning used guarded recovery."}</strong>
        <span>${escapeHtml(detail)}</span>
      </div>
      <button class="run-notice__action" data-action="set-view" data-view="trace">
        ${icon("arrow")}
        <span>View trace</span>
      </button>
    </div>
  `;
}

function renderMobileNavigation(): string {
  if (!state.mobileMenuOpen) return "";

  return `
    <div class="mobile-menu-layer">
      <button class="mobile-menu-backdrop" data-action="close-mobile-menu" aria-label="Close navigation menu"></button>
      <nav class="mobile-navigation" id="mobile-navigation" aria-label="Mobile navigation">
        <div class="mobile-navigation__heading">
          <span>Navigate QuoteX</span>
          <small>Seller and buyer workspace</small>
        </div>
        <button class="mobile-sell-button" data-action="open-seller-intake">
          ${icon("plus")}
          <span>Add a product</span>
        </button>
        <div class="mobile-navigation__links">
          ${mobileNavButton("workbench", "Request", "Describe and run the sales workflow", "01")}
          ${mobileNavButton("quote", "Offer", "Review price, shipping, and terms", "02")}
          ${mobileNavButton("creative", "Campaign", "Create product image and video", "03")}
          ${mobileNavButton("voice", "Customer assistant", "Answer customer questions by voice", "04")}
          ${mobileNavButton("trace", "Agent evidence", "Inspect Qwen tools, policy, and audit trail", "05")}
        </div>
        <div class="mobile-navigation__footer">
          <div class="mobile-mode-switch" aria-label="Inference mode">
            <button class="${state.qwenMode === "qwen-live" ? "is-active" : ""}" data-action="set-qwen-mode" data-mode="qwen-live">Live Qwen</button>
            <button class="${state.qwenMode === "deterministic-demo" ? "is-active" : ""}" data-action="set-qwen-mode" data-mode="deterministic-demo">Demo</button>
          </div>
          <button class="mobile-theme-button" data-action="toggle-theme">
            ${icon(state.theme === "dark" ? "sun" : "moon")}
            ${state.theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </nav>
    </div>
  `;
}

function mobileNavButton(
  view: WorkspaceView,
  label: string,
  detail: string,
  number: string
): string {
  const disabled = state.selectedRfqId === SELLER_ONBOARDING_ID && view !== "workbench";

  return `
    <button class="mobile-nav-link ${state.selectedView === view ? "is-active" : ""}" data-action="set-view" data-view="${view}" ${disabled ? "disabled" : ""}>
      <span>${number}</span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
      ${icon("arrow")}
    </button>
  `;
}

function flowStep(number: string, title: string, detail: string): string {
  return `
    <div class="hero-flow__step hero-flow__step--${escapeHtml(number)}">
      <span>${escapeHtml(number)}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(detail)}</small>
      </div>
    </div>
  `;
}

function renderFlagshipSnapshot(): string {
  return `
    <div class="flagship-snapshot" aria-label="Cashmere export demo summary">
      <img src="${FLAGSHIP_MEDIA_URL}" alt="Charcoal, forest green, and natural oat cashmere scarves" />
      <div class="flagship-snapshot__product">
        <span>Wholesale order</span>
        <strong>500 Grade-A cashmere scarves</strong>
        <small>Three colors · plastic-free packaging · origin documents</small>
      </div>
      <div class="flagship-snapshot__route" aria-label="Ulaanbaatar to Berlin">
        <span>Ulaanbaatar</span>
        ${icon("arrow")}
        <span>Berlin</span>
      </div>
      <div class="flagship-snapshot__buyer">
        <span>Repeat buyer</span>
        <strong>Nordlicht Concept Stores</strong>
        <small>DDP · Net 30 · 21-day target</small>
      </div>
    </div>
  `;
}

function renderEvaluationStrip(): string {
  return `
    <div class="evaluation-strip" aria-label="Measured agent evaluation">
      <div>
        <span>Governed QuoteX</span>
        <strong>42 / 42</strong>
        <small>adversarial checks passed</small>
      </div>
      <div>
        <span>Direct Qwen baseline</span>
        <strong>28 / 42</strong>
        <small>same model and context</small>
      </div>
      <div>
        <span>Verified advantage</span>
        <strong>+33.3 pts</strong>
        <small>checked-in evaluation</small>
      </div>
      <div>
        <span>Commercial authority</span>
        <strong>1 human gate</strong>
        <small>zero automatic sends</small>
      </div>
    </div>
  `;
}

function renderExecutionProof(customer: Customer): string {
  const proof = state.analysis?.executionProof;
  const impact = state.analysis?.memoryImpact;
  const agentRun = state.analysis?.agentRun;
  const completedSkills = agentRun?.completedSkills.length || 0;
  const requiredSkills = agentRun?.requiredSkills.length || 6;

  return `
    <section class="proof-grid" aria-label="Execution proof">
      ${proofCard(
        "Qwen planner",
        proof?.qwenStatus || (state.qwenMode === "qwen-live" ? "Qwen requested" : "Guarded fallback"),
        agentRun
          ? `${agentRun.plannerTurns} bounded turn${agentRun.plannerTurns === 1 ? "" : "s"} · ${agentRun.model}`
          : "Every model call is inspectable"
      )}
      ${proofCard(
        "Verified tools",
        proof ? `${completedSkills}/${requiredSkills} skills complete` : "6 business skills",
        agentRun
          ? `${agentRun.skillExecutions.filter((step) => step.initiatedBy === "qwen").length} selected by Qwen · deterministic outputs`
          : "Memory, catalog, route, price, risk, approval"
      )}
      ${proofCard(
        "Memory leverage",
        impact ? `${impact.factsApplied} facts applied` : `${customer.memory.length} facts available`,
        impact
          ? `${formatUsd(impact.goodsSavingsUsd)} pricing effect · +${impact.routingConfidenceLift} routing confidence`
          : "Evidence-backed and cross-session"
      )}
      ${proofCard(
        "Human control",
        proof ? `${proof.policyChecks} checks · ${proof.risksEscalated} escalated` : "6 policy checks",
        agentRun ? `Send blocked · ${agentRun.auditDigest}` : "Margin, stock, ambiguity, terms, SLA, send gate"
      )}
    </section>
  `;
}

function proofCard(label: string, value: string, detail: string): string {
  return `
    <div class="proof-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderActiveView(customer: Customer): string {
  if (state.selectedView === "voice") {
    return renderVoiceAgentWorkspace(customer);
  }

  if (state.selectedView === "memory") {
    return `
      ${renderMemoryPanel(customer)}
      ${renderLearningPanel()}
    `;
  }

  if (state.selectedView === "quote") {
    return `
      ${renderQuotePanel()}
      ${renderDraftPanel()}
    `;
  }

  if (state.selectedView === "creative") {
    return `
      ${renderMediaPanel()}
      ${renderCreativePanel()}
      ${renderMarketplacePanel()}
    `;
  }

  if (state.selectedView === "trace") {
    return `
      ${renderTracePanel()}
      ${renderTraceSummaryPanel()}
    `;
  }

  if (state.selectedView === "graph") {
    const graph = buildDealGraph(customer);

    return `
      ${renderDealGraphPanel(graph)}
      ${renderDealGraphInspector(graph)}
    `;
  }

  return `
    ${renderTimelinePanel()}
    ${renderDecisionPanel(customer)}
  `;
}

function renderVoiceAgentWorkspace(customer: Customer): string {
  const lastAssistant = [...state.voiceAgent.messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const lastMessage = state.voiceAgent.messages.at(-1);
  const isListening =
    state.voice.isListening && activeVoiceCaptureTarget === "customer-agent";
  const agentTrace = lastAssistant?.trace;
  const ttsTrace = lastAssistant?.ttsTrace;
  const phase = getVoiceAgentPhase(lastAssistant, isListening);
  const rfq = getSelectedRfq();
  const analysis = state.analysis;
  const quote = analysis?.quote;
  const product = analysis?.selectedProduct.product;
  const latestAttachment = [...state.voiceAgent.messages]
    .reverse()
    .find((message) => message.attachment)?.attachment;
  const visual = state.voiceAgent.attachment || latestAttachment || state.productMedia;
  const quoteStatus = analysis
    ? analysis.approval.status === "approved"
      ? "Approved"
      : "Human approval"
    : "Not calculated";
  const suggestedActions = lastAssistant?.suggestedActions?.length
    ? lastAssistant.suggestedActions
    : ["What is the quote total?", "When would it arrive?", "Connect me with sales"];

  return `
    <section class="voice-workspace voice-workspace--${phase.kind}">
      <header class="voice-workspace__header">
        <div>
          <p class="eyebrow">Live customer workspace</p>
          <h2>QuoteX Agent</h2>
          <span>${escapeHtml(customer.company)} · ${escapeHtml(customer.market)}</span>
        </div>
        <div class="voice-workspace__status">
          <span class="voice-live-state voice-live-state--${phase.kind}"><i></i>${escapeHtml(phase.label)}</span>
          <span class="voice-privacy-state" title="The microphone is activated only when you select it">
            ${icon("lock")}<span>Mic on demand</span>
          </span>
        </div>
      </header>

      <div class="voice-service-route" aria-label="Live Qwen voice route">
        ${renderVoiceServiceNode(
          "Hear",
          state.serviceHealth.speechConfigured ? state.serviceHealth.speechModel : "Browser STT",
          isListening || state.voice.isTranscribing ? "active" : state.voice.trace?.status === "live-asr" ? "complete" : "ready",
          "mic"
        )}
        ${renderVoiceServiceNode(
          "Reason",
          agentTrace?.model || state.serviceHealth.agentModel,
          state.voiceAgent.isThinking ? "active" : agentTrace?.status === "live-agent" ? "complete" : "ready",
          "spark"
        )}
        ${renderVoiceServiceNode(
          "Speak",
          ttsTrace?.voiceDesignModel || state.serviceHealth.voiceDesignModel,
          state.voiceAgent.isSpeaking ? "active" : ttsTrace?.status?.startsWith("live") ? "complete" : "ready",
          "speaker"
        )}
      </div>

      <div class="voice-workspace__body">
        <section class="voice-visual-board" aria-label="Agent visual workspace">
          <div class="voice-now-banner">
            <div class="voice-now-banner__signal" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i>
            </div>
            <div>
              <span>Now</span>
              <strong>${escapeHtml(phase.label)}</strong>
              <p>${escapeHtml(phase.detail)}</p>
            </div>
            ${
              state.voiceAgent.isSpeaking
                ? `<button class="voice-inline-control" data-action="stop-agent-audio" title="Stop speaking" aria-label="Stop speaking">${icon("stop")}</button>`
                : ""
            }
          </div>

          <div class="voice-result-grid">
            <article class="voice-result-card voice-result-card--request">
              <span>Current request</span>
              <h3>${escapeHtml(rfq.subject)}</h3>
              <p>${escapeHtml(rfq.destination)} · ${escapeHtml(rfq.priority)} priority</p>
              <strong>${escapeHtml(customer.company)}</strong>
            </article>
            <article class="voice-result-card">
              <span>Product</span>
              <h3>${escapeHtml(product?.name || "Product match pending")}</h3>
              <p>${escapeHtml(product?.sku || "Catalog match unavailable")}</p>
            </article>
            <article class="voice-result-card voice-result-card--metric">
              <span>Quote</span>
              <h3>${quote ? formatUsd(quote.landedTotal) : "Not calculated"}</h3>
              <p>${quote ? `${quote.quantity.toLocaleString("en-US")} units · ${escapeHtml(quote.paymentTerms)}` : "No commercial amount is available"}</p>
            </article>
            <article class="voice-result-card voice-result-card--metric">
              <span>Delivery</span>
              <h3>${analysis ? `${analysis.shipping.days} days` : "Route pending"}</h3>
              <p>${analysis ? `${escapeHtml(analysis.shipping.carrier)} · ${escapeHtml(analysis.shipping.mode)}` : escapeHtml(rfq.destination)}</p>
            </article>
            <article class="voice-result-card">
              <span>Account</span>
              <h3>${escapeHtml(customer.relationship)}</h3>
              <p>${customer.memory.length} verified account fact${customer.memory.length === 1 ? "" : "s"} available</p>
            </article>
            ${
              visual
                ? `<article class="voice-result-card voice-result-card--visual">
                    <img src="${escapeHtml(visual.dataUrl)}" alt="Customer-provided product context" />
                    <div><span>Visual context</span><strong>${escapeHtml(visual.fileName)}</strong></div>
                  </article>`
                : ""
            }
            <article class="voice-approval-card voice-approval-card--${classToken(quoteStatus)}">
              <div>${icon(analysis?.approval.status === "approved" ? "check" : "lock")}</div>
              <section>
                <span>Commercial action</span>
                <h3>${escapeHtml(quoteStatus)}</h3>
                <p>${analysis?.approval.status === "approved" ? "The reviewed quote can be explained to the customer." : "A person remains responsible for every quote decision."}</p>
              </section>
              ${
                !analysis
                  ? `<button class="voice-action-button" data-action="run-autopilot">${icon("play")}<span>Build quote</span></button>`
                  : analysis.approval.status !== "approved"
                    ? `<button class="voice-action-button" data-action="set-view" data-view="quote">${icon("arrow")}<span>Review quote</span></button>`
                    : ""
              }
            </article>
          </div>
        </section>

        ${renderVoiceActivityRail(customer, lastAssistant)}
      </div>

      <section class="voice-transcript-shell">
        <button
          class="voice-transcript-toggle"
          data-action="toggle-voice-transcript"
          aria-expanded="${state.voiceAgent.transcriptExpanded}"
        >
          ${icon("transcript")}
          <strong>Conversation</strong>
          <span>${state.voiceAgent.messages.length} message${state.voiceAgent.messages.length === 1 ? "" : "s"}</span>
          ${icon("chevron")}
        </button>
        ${
          state.voiceAgent.transcriptExpanded
            ? `<div class="voice-conversation" role="log" aria-live="polite" aria-label="Customer conversation">
                ${state.voiceAgent.messages.map(renderVoiceAgentMessage).join("")}
                ${
                  state.voiceAgent.isThinking
                    ? `<div class="voice-message voice-message--assistant voice-message--thinking">
                        <span class="voice-avatar">QX</span>
                        <div><strong>Checking verified context</strong><span class="thinking-dots" aria-label="Thinking"><i></i><i></i><i></i></span></div>
                      </div>`
                    : ""
                }
              </div>`
            : `<div class="voice-live-caption" aria-live="polite">
                <span>${state.voiceAgent.isThinking ? "Agent activity" : lastMessage?.role === "user" ? "You" : "QuoteX"}</span>
                <p>${escapeHtml(state.voiceAgent.isThinking ? "Checking the verified quote and customer-safe context." : lastMessage?.content || "Ready for a customer question.")}</p>
                ${
                  lastMessage?.role === "assistant"
                    ? `<button data-action="play-agent-message" data-message-id="${escapeHtml(lastMessage.id)}" title="Replay voice" aria-label="Replay voice">${icon("speaker")}</button>`
                    : ""
                }
              </div>`
        }
        <div class="voice-quick-actions">
          ${suggestedActions
            .slice(0, 3)
            .map(
              (question) => `<button data-action="voice-agent-suggestion" data-message="${escapeHtml(question)}" ${state.voiceAgent.isThinking ? "disabled" : ""}>${escapeHtml(question)}</button>`
            )
            .join("")}
        </div>
      </section>

      ${renderVoiceControlDock(isListening)}
      ${
        state.voiceAgent.error
          ? `<div class="voice-agent-error" role="alert">${icon("warning")}<span>${escapeHtml(state.voiceAgent.error)}</span></div>`
          : ""
      }
    </section>
  `;
}

function getVoiceAgentPhase(
  lastAssistant: VoiceAgentMessage | undefined,
  isListening: boolean
): VoiceAgentPhase {
  if (state.voiceAgent.error) {
    return {
      kind: "recovering",
      label: "Recovery needed",
      detail: state.voiceAgent.error
    };
  }
  if (isListening) {
    return {
      kind: "listening",
      label: "Listening",
      detail: "Capturing the customer's complete thought."
    };
  }
  if (state.voice.isTranscribing) {
    return {
      kind: "following",
      label: "Following",
      detail: `${state.serviceHealth.speechModel} is preserving names, quantities, and dates.`
    };
  }
  if (state.voiceAgent.isThinking) {
    return {
      kind: "using-tools",
      label: "Checking verified context",
      detail: `${state.serviceHealth.agentModel} is reviewing the quote, route, product, and policy boundary.`
    };
  }
  if (state.voiceAgent.isSpeaking) {
    return {
      kind: "responding",
      label: "Responding",
      detail: "The designed QuoteX voice is speaking."
    };
  }
  if (lastAssistant?.needsHuman) {
    return {
      kind: "waiting-approval",
      label: "Waiting for sales",
      detail: "The request needs a person before the agent can continue."
    };
  }
  if (state.voiceAgent.messages.length > 1) {
    return {
      kind: "completed",
      label: "Ready for follow-up",
      detail: "The latest answer is complete and the workspace remains in context."
    };
  }
  return {
    kind: "ready",
    label: "Ready",
    detail: state.analysis
      ? "Verified quote context is connected."
      : "The customer request is connected; commercial values are not calculated yet."
  };
}

function renderVoiceServiceNode(
  label: string,
  model: string,
  status: "ready" | "active" | "complete",
  iconName: string
): string {
  return `
    <div class="voice-service-node voice-service-node--${status}">
      <span>${icon(iconName)}</span>
      <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(model)}</strong></div>
      <i aria-label="${escapeHtml(status)}"></i>
    </div>
  `;
}

function renderVoiceActivityRail(
  customer: Customer,
  lastAssistant: VoiceAgentMessage | undefined
): string {
  const analysis = state.analysis;
  const answerComplete = lastAssistant?.trace?.status === "live-agent";
  const voiceComplete = Boolean(lastAssistant?.ttsTrace?.status?.startsWith("live"));
  const approvalStatus = analysis?.approval.status === "approved"
    ? "complete"
    : analysis
      ? "waiting"
      : "pending";

  return `
    <aside class="voice-activity-rail" aria-label="Agent activity">
      <header>
        <div><span>Activity</span><h3>What the agent is doing</h3></div>
        ${icon("activity")}
      </header>
      <ol>
        ${renderVoiceActivityItem(
          "Customer context",
          `${customer.company} request loaded`,
          "complete"
        )}
        ${renderVoiceActivityItem(
          "Quote tools",
          analysis
            ? `${analysis.executionProof.deterministicToolStages} verified stages complete`
            : state.isRunning
              ? "Catalog, price, and freight are running"
              : "Commercial calculation not started",
          analysis ? "complete" : state.isRunning ? "active" : "pending"
        )}
        ${renderVoiceActivityItem(
          "Qwen response",
          state.voiceAgent.isThinking
            ? `${state.serviceHealth.agentModel} is checking context`
            : answerComplete
              ? `${lastAssistant?.trace?.elapsedMs || 0} ms · grounded answer`
              : "Waiting for a customer question",
          state.voiceAgent.isThinking ? "active" : answerComplete ? "complete" : "pending"
        )}
        ${renderVoiceActivityItem(
          "Voice output",
          state.voiceAgent.isSpeaking
            ? "Designed voice is speaking"
            : voiceComplete
              ? `${lastAssistant?.voiceProvider || "Qwen Voice Design"} ready`
              : "No spoken response yet",
          state.voiceAgent.isSpeaking ? "active" : voiceComplete ? "complete" : "pending"
        )}
        ${renderVoiceActivityItem(
          "Human checkpoint",
          analysis?.approval.status === "approved"
            ? "Quote approved by a person"
            : analysis
              ? "Quote is waiting for review"
              : "No approval requested",
          approvalStatus
        )}
      </ol>
      <footer>
        ${icon("lock")}
        <span>Voice can explain and prepare. A person approves commercial action.</span>
      </footer>
    </aside>
  `;
}

function renderVoiceActivityItem(
  label: string,
  detail: string,
  status: "pending" | "active" | "waiting" | "complete"
): string {
  return `
    <li class="voice-activity-item voice-activity-item--${status}">
      <i aria-hidden="true"></i>
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>
      ${status === "complete" ? icon("check") : status === "waiting" ? icon("lock") : ""}
    </li>
  `;
}

function renderVoiceControlDock(isListening: boolean): string {
  const attachment = state.voiceAgent.attachment;
  const controlsDisabled = state.voiceAgent.isThinking || state.voice.isTranscribing;

  return `
    <footer class="voice-control-dock">
      ${
        attachment
          ? `<div class="voice-attachment-preview">
              <img src="${escapeHtml(attachment.dataUrl)}" alt="Attached product context" />
              <div><strong>${escapeHtml(attachment.fileName)}</strong><span>${formatBytes(attachment.sizeBytes)}</span></div>
              <button data-action="clear-voice-attachment" aria-label="Remove attachment" title="Remove attachment">${icon("close")}</button>
            </div>`
          : ""
      }
      <div class="voice-control-row">
        <div class="voice-media-controls">
          <label class="voice-dock-icon" title="Use camera" aria-label="Use camera">
            ${icon("camera")}
            <input data-field="voice-agent-camera" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" ${controlsDisabled ? "disabled" : ""} />
          </label>
          <label class="voice-dock-icon" title="Attach product image" aria-label="Attach product image">
            ${icon("paperclip")}
            <input data-field="voice-agent-attachment" type="file" accept="image/png,image/jpeg,image/webp" ${controlsDisabled ? "disabled" : ""} />
          </label>
        </div>
        <textarea
          class="voice-agent-input"
          data-field="voice-agent-message"
          rows="1"
          maxlength="2000"
          placeholder="Ask or type a precise detail"
          aria-label="Message the customer voice agent"
          ${state.voiceAgent.isThinking ? "disabled" : ""}
        >${escapeHtml(state.voiceAgent.draft)}</textarea>
        <button
          class="voice-record-button ${isListening ? "is-active" : ""}"
          data-action="toggle-voice-agent"
          aria-label="${isListening ? "Stop recording and send" : "Talk to the voice agent"}"
          title="${isListening ? "Stop and send" : state.voiceAgent.isSpeaking ? "Interrupt and talk" : "Talk"}"
          ${controlsDisabled ? "disabled" : ""}
        >${isListening ? icon("stop") : icon("mic")}</button>
        <button
          class="voice-send-button"
          data-action="send-voice-agent"
          aria-label="Send message"
          title="Send"
          ${state.voiceAgent.isThinking ? "disabled" : ""}
        >${icon("arrow")}</button>
      </div>
      <div class="voice-control-footer">
        <span>${escapeHtml(isListening || state.voice.isTranscribing ? state.voice.status : state.analysis ? "Verified quote context connected" : "Customer request context connected")}</span>
        <button data-action="end-voice-session">${icon("phone-off")}<span>End</span></button>
      </div>
    </footer>
  `;
}

function renderVoiceAgentMessage(message: VoiceAgentMessage): string {
  const isSpeaking = state.voiceAgent.speakingMessageId === message.id;
  const traceLabel = message.trace?.status === "live-agent"
    ? "Qwen answer"
    : "";
  const voiceLabel = message.voiceMode === "cloud-tts"
    ? `${message.voiceProvider || "Cloud voice"} · ${message.voiceName || state.serviceHealth.ttsVoice}`
    : message.ttsTrace?.status === "error"
      ? "Qwen designed voice unavailable"
      : "";

  return `
    <div class="voice-message voice-message--${message.role}">
      <span class="voice-avatar">${message.role === "assistant" ? "QX" : "You"}</span>
      <div class="voice-message__content">
        ${
          message.attachment
            ? `<img class="voice-message__attachment" src="${escapeHtml(message.attachment.dataUrl)}" alt="Attached product context" />`
            : ""
        }
        <p>${escapeHtml(message.content)}</p>
        ${
          message.role === "assistant"
            ? `<div class="voice-message__meta">
                ${traceLabel ? `<span>${escapeHtml(traceLabel)}</span>` : ""}
                ${voiceLabel ? `<span>${escapeHtml(voiceLabel)}</span>` : ""}
                ${message.needsHuman ? `<span class="needs-human">Human follow-up</span>` : ""}
                <button
                  data-action="${isSpeaking ? "stop-agent-audio" : "play-agent-message"}"
                  data-message-id="${escapeHtml(message.id)}"
                  aria-label="${isSpeaking ? "Stop speaking" : "Replay spoken response"}"
                  title="${isSpeaking ? "Stop" : "Replay voice"}"
                >${icon(isSpeaking ? "stop" : "speaker")}</button>
              </div>`
            : ""
        }
        ${
          message.role === "assistant" && message.suggestedActions?.length
            ? `<div class="voice-suggestions">
                ${message.suggestedActions
                  .map(
                    (suggestion) => `<button data-action="voice-agent-suggestion" data-message="${escapeHtml(
                      suggestion
                    )}" ${state.voiceAgent.isThinking ? "disabled" : ""}>${escapeHtml(suggestion)}</button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderTracePanel(): string {
  const trace = state.analysis?.qwenTrace;
  const agentRun = state.analysis?.agentRun;

  if (!trace) {
    return panelPlaceholder("Agent evidence", "Run a request to see every tool and policy decision");
  }

  if (!agentRun) {
    const response = trace.response || { status: trace.status, error: trace.error || trace.reason };
    return `
      <section class="panel trace-panel">
        <div class="panel__header">
          <div><p class="eyebrow">Qwen Cloud</p><h2>Model trace</h2></div>
          <span class="status-pill status-pill--${trace.status === "live" ? "success" : "warning"}">${escapeHtml(trace.status)}</span>
        </div>
        <pre class="trace-code">${escapeHtml(JSON.stringify(response, null, 2))}</pre>
      </section>
    `;
  }

  const live = agentRun.status === "live";

  return `
    <section class="panel trace-panel agent-evidence-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">How the agent decided</p>
          <h2>Verified decision trail</h2>
        </div>
        <span class="status-pill status-pill--${live ? "success" : "warning"}">
          ${live ? "Live Qwen" : "Guarded recovery"}
        </span>
      </div>
      <div class="agent-run-summary">
        <span>${icon(live ? "spark" : "warning")}</span>
        <div>
          <strong>${escapeHtml(agentRun.finalSummary)}</strong>
          <small>No offer was sent. Human approval is still required.</small>
        </div>
      </div>
      <div class="trace-grid">
        ${traceFact(
          "Planner",
          live
            ? `${agentRun.model} · ${agentRun.plannerTurns}/${agentRun.maxPlannerTurns} turns`
            : `Guardrail · ${agentRun.plannerTurns} model turns`
        )}
        ${traceFact("Skills", `${agentRun.completedSkills.length}/${agentRun.requiredSkills.length} completed`)}
        ${traceFact("Runtime", `${agentRun.elapsedMs} ms`)}
        ${traceFact("Audit", agentRun.auditDigest)}
      </div>
      <ol class="agent-skill-list" aria-label="Executed agent skills">
        ${agentRun.skillExecutions.map(renderAgentSkillExecution).join("")}
      </ol>
    </section>
  `;
}

function renderTraceSummaryPanel(): string {
  const trace = state.analysis?.qwenTrace;
  const prompt = trace?.prompt;
  const agentRun = state.analysis?.agentRun;

  return `
    <section class="panel trace-prompt-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Trust boundary</p>
          <h2>What Qwen can and cannot do</h2>
        </div>
      </div>
      <div class="trust-boundary-list">
        <div>${icon("spark")}<span><strong>Qwen plans</strong><small>Extracts intent and chooses which business skills to call.</small></span></div>
        <div>${icon("database")}<span><strong>Tools decide facts</strong><small>Catalog, memory, freight, pricing, and risk outputs are deterministic.</small></span></div>
        <div>${icon("check")}<span><strong>You approve</strong><small>The agent cannot publish or send a commercial offer.</small></span></div>
      </div>
      <div class="evaluation-result">
        ${icon("shield")}
        <span>
          <strong>42 / 42 governed checks passed</strong>
          <small>Latest live Qwen3.7 adversarial run. A direct one-prompt agent passed 28 / 42.</small>
        </span>
      </div>
      <div class="architecture-comparison" role="table" aria-label="Direct prompt and QuoteX trust comparison">
        <div class="architecture-comparison__header" role="row">
          <span role="columnheader">Decision</span>
          <span role="columnheader">One prompt</span>
          <span role="columnheader">QuoteX</span>
        </div>
        <div role="row">
          <strong role="cell">Product & stock</strong>
          <span role="cell">Model answer</span>
          <span role="cell">Catalog tool</span>
        </div>
        <div role="row">
          <strong role="cell">Price & freight</strong>
          <span role="cell">Best-effort math</span>
          <span role="cell">Recomputed</span>
        </div>
        <div role="row">
          <strong role="cell">Send offer</strong>
          <span role="cell">Prompt rule</span>
          <span role="cell">Hard human gate</span>
        </div>
      </div>
      ${
        prompt
          ? `<details class="trace-payload-details">
              <summary>Inspect sanitized Qwen request and usage</summary>
              <div class="trace-grid trace-grid--compact">
                ${traceFact("Endpoint", trace?.endpointHost || agentRun?.endpointHost || "n/a")}
                ${traceFact("Tokens", trace?.usage?.total_tokens ? String(trace.usage.total_tokens) : "n/a")}
              </div>
              <pre class="trace-code trace-code--prompt">${escapeHtml(prompt)}</pre>
            </details>`
          : renderEmptyState("No model payload", trace?.error || trace?.reason || "Awaiting agent run.")
      }
    </section>
  `;
}

function renderAgentSkillExecution(step: NonNullable<Analysis["agentRun"]>["skillExecutions"][number]): string {
  return `
    <li class="agent-skill agent-skill--${step.status}">
      <span class="agent-skill__index">${escapeHtml(step.id.split("-")[0] || "")}</span>
      <div class="agent-skill__body">
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <span>${step.initiatedBy === "qwen" ? "Chosen by Qwen" : "Completed by guardrail"}</span>
        </div>
        <p>${escapeHtml(step.outputSummary)}</p>
        <small>${escapeHtml(step.inputSummary)} · ${formatToolDuration(step.elapsedMs)}</small>
      </div>
      <span class="agent-skill__status">${icon(step.status === "succeeded" ? "check" : "warning")}</span>
    </li>
  `;
}

function formatToolDuration(elapsedMs: number): string {
  return elapsedMs < 1 ? "&lt;1 ms" : `${elapsedMs} ms`;
}

function buildDealGraph(customer: Customer): DealGraph {
  const rfq = getSelectedRfq();
  const analysis = state.analysis;
  const media = state.productMedia;
  const asset = state.marketingAsset;
  const learnedCount = state.memoryStore[customer.id]?.length || 0;
  const qwenStatus = analysis?.qwenTrace.status || (state.isRunning ? "running" : "waiting");
  const approvalStatus = analysis?.approval.status || "waiting";
  const creativeStatus = asset
    ? state.marketingTrace?.status || asset.visualMode
    : media
      ? "media-ready"
      : "waiting";
  const memoryDetail = `${customer.memory.length} seeded · ${learnedCount} learned`;

  const nodes: DealGraphNode[] = [
    {
      id: "rfq",
      label: "Buyer RFQ",
      detail: `${customer.company} · ${rfq.priority} priority`,
      kind: "input",
      x: 12,
      y: 48,
      status: rfq.isCustomDraft ? "draft" : "anchored",
      metric: rfq.channel
    },
    {
      id: "media",
      label: "Product media",
      detail: media ? media.fileName : "No photo anchored",
      kind: "media",
      x: 18,
      y: 78,
      status: media ? "anchored" : "waiting",
      metric: media ? formatBytes(media.sizeBytes) : "optional",
      image: media?.dataUrl
    },
    {
      id: "parser",
      label: "Qwen parser",
      detail: analysis?.qwenTrace.model || state.serviceHealth.model,
      kind: "model",
      x: 34,
      y: 28,
      status: qwenStatus,
      metric: analysis?.qwenTrace.elapsedMs ? `${analysis.qwenTrace.elapsedMs} ms` : state.qwenMode
    },
    {
      id: "memory",
      label: "Account memory",
      detail: memoryDetail,
      kind: "memory",
      x: 35,
      y: 68,
      status: analysis?.relevantMemories.length ? "applied" : "available",
      metric: analysis ? `${analysis.relevantMemories.length} applied` : "ready"
    },
    {
      id: "product",
      label: "Product match",
      detail: analysis ? analysis.selectedProduct.product.name : "Catalog decision pending",
      kind: "product",
      x: 55,
      y: 31,
      status: analysis ? "selected" : "waiting",
      metric: analysis ? `${Math.round(analysis.selectedProduct.score * 100)}%` : "pending"
    },
    {
      id: "quote",
      label: "Quote draft",
      detail: analysis ? formatUsd(analysis.quote.landedTotal) : "No commercial offer",
      kind: "quote",
      x: 72,
      y: 42,
      status: analysis ? "priced" : "waiting",
      metric: analysis ? `${Math.round(analysis.quote.margin * 100)}% margin` : "pending"
    },
    {
      id: "risk",
      label: "Risk checks",
      detail: analysis ? `${analysis.risks.length} escalation${analysis.risks.length === 1 ? "" : "s"}` : "Policy gate idle",
      kind: "risk",
      x: 58,
      y: 72,
      status: analysis?.risks.length ? "flagged" : analysis ? "clear" : "waiting",
      metric: analysis ? `${analysis.executionProof.policyChecks} checks` : "6 checks"
    },
    {
      id: "route",
      label: "Fulfillment route",
      detail: analysis ? analysis.shipping.route : "Route not scored",
      kind: "route",
      x: 76,
      y: 76,
      status: analysis ? "scored" : "waiting",
      metric: analysis ? `${analysis.shipping.days} days` : "pending"
    },
    {
      id: "approval",
      label: "Human checkpoint",
      detail: analysis?.approval.reason || "Commercial send gate",
      kind: "approval",
      x: 91,
      y: 51,
      status: approvalStatus,
      metric: approvalStatus
    },
    {
      id: "creative",
      label: "Campaign asset",
      detail: asset ? asset.brief.headline : media ? "Photo ready for Qwen edit" : "No asset generated",
      kind: "creative",
      x: 91,
      y: 82,
      status: creativeStatus,
      metric: asset?.visualMode || "optional",
      image: asset?.imageDataUrl || media?.dataUrl
    }
  ];

  const links: DealGraphLink[] = [
    { from: "rfq", to: "parser", label: "extract", kind: "agent" },
    { from: "rfq", to: "memory", label: "recall", kind: "memory" },
    { from: "parser", to: "product", label: "hints", kind: "agent" },
    { from: "memory", to: "quote", label: "terms", kind: "memory" },
    { from: "product", to: "quote", label: "price", kind: "agent" },
    { from: "quote", to: "risk", label: "policy", kind: "policy" },
    { from: "quote", to: "route", label: "ship", kind: "agent" },
    { from: "risk", to: "approval", label: "gate", kind: "policy" },
    { from: "route", to: "approval", label: "SLA", kind: "policy" },
    { from: "media", to: "creative", label: "visual", kind: "media" },
    { from: "quote", to: "creative", label: "copy", kind: "media" },
    { from: "approval", to: "memory", label: "learn", kind: "memory" }
  ];

  const anchors: DealGraphAnchor[] = [
    { label: "Starting RFQ", detail: rfq.subject, status: rfq.isCustomDraft ? "draft" : "scenario" },
    { label: "Buyer account", detail: customer.company, status: customer.relationship },
    { label: "Memory base", detail: memoryDetail, status: analysis ? `${analysis.relevantMemories.length} used` : "ready" },
    {
      label: "Product photo",
      detail: media ? media.fileName : "not uploaded",
      status: media ? "anchored" : "missing"
    },
    {
      label: "Audit trail",
      detail: analysis?.executionProof.auditId || "no run",
      status: analysis?.qwenTrace.status || "idle"
    }
  ];

  if (asset) {
    anchors.push({
      label: "Generated creative",
      detail: asset.fileName,
      status: state.marketingTrace?.status || asset.visualMode
    });
  }

  return {
    nodes,
    links,
    anchors,
    trajectory: buildDealGraphTrajectory()
  };
}

function buildDealGraphTrajectory(): DealGraphTrajectoryItem[] {
  const analysis = state.analysis;
  const trajectory: DealGraphTrajectoryItem[] = analysis
    ? analysis.timeline.slice(0, state.visibleStageCount).map((step) => ({
        role: step.role,
        title: step.title,
        status: executionLabel(step.executionType)
      }))
    : [];

  if (state.productMedia) {
    trajectory.push({
      role: "Media Intake",
      title: state.productMedia.fileName,
      status: "Anchored"
    });
  }

  if (state.marketingAsset) {
    trajectory.push({
      role: "Creative Agent",
      title: state.marketingAsset.brief.headline,
      status: state.marketingTrace?.status || state.marketingAsset.visualMode
    });
  }

  if (analysis?.approval.status === "approved") {
    trajectory.push({
      role: "Memory Agent",
      title: "Approved outcome stored",
      status: "Memory write"
    });
  }

  if (!trajectory.length) {
    trajectory.push({
      role: "Autopilot",
      title: state.isRunning ? "Building graph" : "Idle",
      status: state.isRunning ? "Running" : "Waiting"
    });
  }

  return trajectory;
}

function renderDealGraphPanel(graph: DealGraph): string {
  const exportHref = buildDealGraphExportHref(graph);

  return `
    <section class="panel deal-graph-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Why this quote is safe</p>
          <h2>Decision trail</h2>
          <p class="panel__description">A visual audit map of the current RFQ. It connects the buyer's request to Qwen extraction, verified commercial checks, and the human approval gate.</p>
        </div>
        <span class="status-pill status-pill--${state.analysis ? "success" : "warning"}">
          ${state.analysis ? "Decision captured" : "Run Autopilot first"}
        </span>
      </div>
      <div class="deal-graph-guide">
        <strong>How to read it</strong>
        <span>Follow the lines from left to right: request → interpretation → quote math → policy review → human decision.</span>
      </div>
      <div class="deal-graph-legend" aria-label="Decision trail legend">
        <span><i class="deal-legend-swatch deal-legend-swatch--agent"></i>Qwen and verified tools</span>
        <span><i class="deal-legend-swatch deal-legend-swatch--memory"></i>Customer memory</span>
        <span><i class="deal-legend-swatch deal-legend-swatch--policy"></i>Policy gate</span>
      </div>
      <div class="deal-graph-scene ${state.analysis ? "" : "deal-graph-scene--empty"}" aria-label="QuoteX decision trail">
        <div class="deal-graph-live"><i></i><span>${state.isRunning ? "renderer busy" : "renderer live"}</span></div>
        ${
          state.analysis
            ? ""
            : `<div class="deal-graph-empty"><strong>Run Autopilot to build the decision trail</strong><span>The nodes below are the available checks. After the run, they will show the actual product, price, route, risks, and approval state for this RFQ.</span></div>`
        }
        ${renderDealGraphLinks(graph)}
        ${graph.links.map((link) => renderDealGraphLinkLabel(graph, link)).join("")}
        ${graph.nodes.map(renderDealGraphNode).join("")}
      </div>
      <div class="deal-graph-actions">
        <button class="primary-button" data-action="run-autopilot" ${state.isRunning ? "disabled" : ""}>
          ${icon("spark")}
          <span>${state.isRunning ? "Running" : "Refresh graph"}</span>
        </button>
        <a class="secondary-button secondary-button--link" href="${escapeHtml(exportHref)}" download="quotex-deal-graph.json">
          ${icon("download")}
          <span>Export graph</span>
        </a>
        <span>${graph.nodes.length} nodes · ${graph.links.length} links · ${graph.trajectory.length} trajectory events</span>
      </div>
    </section>
  `;
}

function renderDealGraphLinks(graph: DealGraph): string {
  return `
    <svg class="deal-graph-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${graph.links
        .map((link) => {
          const from = graph.nodes.find((node) => node.id === link.from);
          const to = graph.nodes.find((node) => node.id === link.to);
          if (!from || !to) return "";

          return `<line class="deal-link deal-link--${link.kind}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
        })
        .join("")}
    </svg>
  `;
}

function renderDealGraphLinkLabel(graph: DealGraph, link: DealGraphLink): string {
  const from = graph.nodes.find((node) => node.id === link.from);
  const to = graph.nodes.find((node) => node.id === link.to);
  if (!from || !to) return "";

  return `
    <span class="deal-link-label deal-link-label--${link.kind} deal-link-label--${link.from}-${link.to}">
      ${escapeHtml(link.label)}
    </span>
  `;
}

function renderDealGraphNode(node: DealGraphNode): string {
  return `
    <article
      class="deal-node deal-node--${node.kind} deal-node--${node.id} deal-node--${classToken(node.status)}"
    >
      ${node.image ? `<img src="${escapeHtml(node.image)}" alt="" />` : `<span>${icon(dealNodeIcon(node.kind))}</span>`}
      <div>
        <strong>${escapeHtml(node.label)}</strong>
        <small>${escapeHtml(node.detail)}</small>
      </div>
      ${node.metric ? `<em>${escapeHtml(node.metric)}</em>` : ""}
    </article>
  `;
}

function renderDealGraphInspector(graph: DealGraph): string {
  return `
    <section class="panel deal-graph-inspector">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Evidence used</p>
          <h2>${graph.anchors.length} evidence points</h2>
        </div>
      </div>
      <div class="deal-anchor-list">
        ${graph.anchors.map(renderDealGraphAnchor).join("")}
      </div>
      <div class="deal-trajectory">
        <div class="deal-trajectory__heading">
          <strong>Run timeline</strong>
          <span>${graph.trajectory.length}</span>
        </div>
        ${graph.trajectory.map(renderDealGraphTrajectoryItem).join("")}
      </div>
    </section>
  `;
}

function renderDealGraphAnchor(anchor: DealGraphAnchor): string {
  return `
    <article class="deal-anchor">
      <span>${escapeHtml(anchor.status)}</span>
      <strong>${escapeHtml(anchor.label)}</strong>
      <small>${escapeHtml(anchor.detail)}</small>
    </article>
  `;
}

function renderDealGraphTrajectoryItem(item: DealGraphTrajectoryItem, index: number): string {
  return `
    <article class="deal-trajectory-item">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <div>
        <strong>${escapeHtml(item.role)}</strong>
        <small>${escapeHtml(item.title)}</small>
      </div>
      <em>${escapeHtml(item.status)}</em>
    </article>
  `;
}

function buildDealGraphExportHref(graph: DealGraph): string {
  const analysis = state.analysis;
  const payload = {
    exportedAt: new Date().toISOString(),
    rfqId: state.selectedRfqId,
    customer: analysis?.customer.company || getCustomer(getSelectedRfq().customerId).company,
    auditId: analysis?.executionProof.auditId || null,
    qwenStatus: analysis?.qwenTrace.status || state.qwenMode,
    graph
  };

  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
}

function dealNodeIcon(kind: DealGraphNodeKind): string {
  const icons: Record<DealGraphNodeKind, string> = {
    input: "empty",
    media: "camera",
    model: "spark",
    memory: "memory",
    product: "node",
    quote: "quote",
    risk: "warning",
    route: "route",
    approval: "check",
    creative: "camera"
  };

  return icons[kind];
}

function renderRfqListItem(rfq: RfqScenario): string {
  const listing = rfq.listingId
    ? state.listings.items.find((candidate) => candidate.id === rfq.listingId)
    : null;
  const customer = getCustomer(rfq.customerId);
  const isSelected = rfq.id === state.selectedRfqId;
  const isGuidedDemo = FLAGSHIP_RFQ_IDS.has(rfq.id);

  if (listing) {
    return `
      <button class="rfq-item rfq-item--listing ${isSelected ? "is-selected" : ""}" data-action="select-rfq" data-rfq-id="${escapeHtml(rfq.id)}" aria-current="${isSelected ? "true" : "false"}">
        <img src="${escapeHtml(listing.photo.url)}" alt="" />
        <span class="rfq-item__main">
          <strong>${escapeHtml(`${listing.brand} ${listing.model}`)}</strong>
          <small>${escapeHtml(listing.condition)} · ${escapeHtml(formatUsd(listing.askingPriceUsd))}</small>
          <em>${icon("database")} Saved listing</em>
        </span>
        ${icon("arrow")}
      </button>
    `;
  }

  return `
    <button class="rfq-item ${isGuidedDemo ? "rfq-item--guided" : ""} ${isSelected ? "is-selected" : ""}" data-action="select-rfq" data-rfq-id="${escapeHtml(rfq.id)}" aria-current="${isSelected ? "true" : "false"}">
      <span class="rfq-item__main">
        <strong>${escapeHtml(customer.company)}</strong>
        <small>${escapeHtml(rfq.subject)}</small>
        ${rfq.demoLabel ? `<em>${escapeHtml(rfq.demoLabel)}</em>` : ""}
      </span>
      <span class="priority priority--${rfq.priority.toLowerCase()}">${escapeHtml(rfq.priority)}</span>
    </button>
  `;
}

function renderGuidedDemoGroup(): string {
  const scenarios = rfqScenarios.filter((rfq) => FLAGSHIP_RFQ_IDS.has(rfq.id));

  return `
    <section class="rfq-group guided-demo-group" aria-labelledby="guided-demo-heading">
      <div class="rfq-group__heading" id="guided-demo-heading">
        <span>Cashmere export demo</span>
        <strong>${scenarios.length} steps</strong>
      </div>
      ${scenarios.map(renderRfqListItem).join("")}
    </section>
  `;
}

function renderSellerListingGroup(): string {
  const count = state.listings.items.length;
  let content = "";

  if (state.listings.status === "loading") {
    content = `<div class="listing-list-state"><span class="spinner" aria-hidden="true"></span><strong>Loading your listings</strong></div>`;
  } else if (state.listings.status === "error") {
    content = `<div class="listing-list-state listing-list-state--error"><strong>Database unavailable</strong><span>${escapeHtml(state.listings.error)}</span></div>`;
  } else if (!count) {
    content = `
      <button class="listing-empty-action" data-action="open-seller-intake">
        <span>${icon("plus")}</span>
        <strong>Add your first item</strong>
        <small>Details and photos are saved privately.</small>
      </button>
    `;
  } else {
    content = state.listings.items.map((listing) => renderRfqListItem(listingToRfq(listing))).join("");
  }

  return `
    <section class="rfq-group" aria-labelledby="your-listings-heading">
      <div class="rfq-group__heading" id="your-listings-heading">
        <span>Your products</span>
        <strong>${count}</strong>
      </div>
      ${content}
    </section>
  `;
}

function renderExampleRequestGroup(): string {
  const examples = rfqScenarios.filter((rfq) => !FLAGSHIP_RFQ_IDS.has(rfq.id));

  return `
    <section class="example-request-group ${state.examplesExpanded ? "is-open" : ""}">
      <button class="example-request-toggle" data-action="toggle-examples" aria-expanded="${state.examplesExpanded}">
        <span>More business examples</span>
        <strong>${examples.length}</strong>
        ${icon("chevron")}
      </button>
      ${
        state.examplesExpanded
          ? `<div class="example-request-group__items">${examples.map(renderRfqListItem).join("")}</div>`
          : ""
      }
    </section>
  `;
}

function renderSelectedListingSummary(listing: SellerListing): string {
  return `
    <div class="selected-listing-summary" aria-label="Saved listing details">
      <div>
        <span>Asking</span>
        <strong>${escapeHtml(formatUsd(listing.askingPriceUsd))}</strong>
      </div>
      <div>
        <span>Condition</span>
        <strong>${escapeHtml(listing.condition)}</strong>
      </div>
      <div>
        <span>From</span>
        <strong>${escapeHtml(listing.sellerLocation)}</strong>
      </div>
      <div class="selected-listing-summary__saved">
        ${icon("database")}
        <span>SQLite · ${escapeHtml(formatShortDate(listing.createdAt))}</span>
      </div>
    </div>
  `;
}

function renderSellerOnboardingPanel(): string {
  return `
    <section class="panel seller-onboarding-panel">
      <div class="seller-onboarding-panel__copy">
        <p class="eyebrow">Start here</p>
        <h2>Add any product</h2>
        <p>Describe it once. QuoteX saves the facts, builds a cross-border offer with Qwen, and carries the same product photo into Campaign.</p>
        <button class="primary-button" data-action="open-seller-intake">
          ${icon("plus")}
          <span>Describe your product</span>
        </button>
      </div>
      <div class="seller-onboarding-steps" aria-label="Seller intake requirements">
        <div>
          <span>01</span>
          <strong>Item profile</strong>
          <small>Brand, model, condition, color, and description</small>
        </div>
        <div>
          <span>02</span>
          <strong>Sale intent</strong>
          <small>Asking price, location, timeline, and target market</small>
        </div>
        <div>
          <span>03</span>
          <strong>Evidence</strong>
          <small>Primary photo, ownership confirmation, and optional verification notes</small>
        </div>
      </div>
      <footer>
        <span>${icon("database")} SQLite workspace ready</span>
        <small>Nothing is published without your approval.</small>
      </footer>
    </section>
  `;
}

function renderListingNotice(): string {
  return `
    <div class="listing-notice" role="status">
      <span>${icon("check")}</span>
      <div>
        <strong>Listing saved</strong>
        <small>${escapeHtml(state.listingNotice)}</small>
      </div>
      ${
        getSelectedListing()
          ? `<button data-action="run-autopilot" ${state.isRunning ? "disabled" : ""}>${icon("spark")} Build sale plan</button>`
          : ""
      }
    </div>
  `;
}

function renderSellerIntakeDialog(): string {
  const missingFields = getMissingSellerFields(state.sellerIntake.draft);
  const aiSaveBlocked =
    state.sellerIntake.mode === "ai" &&
    (missingFields.length > 0 ||
      !state.sellerIntake.photo ||
      !state.sellerIntake.draft.ownershipConfirmed ||
      state.sellerIntake.ai.isThinking);

  return `
    <div class="seller-intake-layer">
      <button class="seller-intake-backdrop" data-action="close-seller-intake" aria-label="Close seller intake"></button>
      <section class="seller-intake-dialog seller-intake-dialog--${state.sellerIntake.mode}" role="dialog" aria-modal="true" aria-labelledby="seller-intake-title">
        <header class="seller-intake-dialog__header">
          <div>
            <p class="eyebrow">Private product intake</p>
            <h2 id="seller-intake-title">What would you like to sell?</h2>
            <span>Nothing is published until you approve it.</span>
          </div>
          <button class="seller-intake-close" data-action="close-seller-intake" aria-label="Close" title="Close" ${state.sellerIntake.isSaving ? "disabled" : ""}>${icon("close")}</button>
        </header>

        <form class="seller-intake-form" data-form="seller-intake">
          <div class="seller-intake-mode-switch" role="group" aria-label="Seller intake method">
            <button type="button" class="${state.sellerIntake.mode === "ai" ? "is-active" : ""}" data-action="set-seller-intake-mode" data-mode="ai" aria-pressed="${state.sellerIntake.mode === "ai"}">
              ${icon("spark")}
              <span><strong>AI assistant</strong><small>Speak or type naturally</small></span>
            </button>
            <button type="button" class="${state.sellerIntake.mode === "manual" ? "is-active" : ""}" data-action="set-seller-intake-mode" data-mode="manual" aria-pressed="${state.sellerIntake.mode === "manual"}">
              ${icon("edit")}
              <span><strong>Fill manually</strong><small>Enter each field yourself</small></span>
            </button>
          </div>

          <div class="seller-intake-mode-content seller-intake-mode-content--${state.sellerIntake.mode}">
            ${state.sellerIntake.mode === "ai" ? renderAiSellerIntake() : renderManualSellerIntake()}
          </div>

          <footer class="seller-intake-dialog__footer">
            <span>
              ${icon(state.sellerIntake.mode === "ai" ? "spark" : "database")}
              ${escapeHtml(sellerIntakeFooterStatus(missingFields))}
            </span>
            <div>
              <button type="button" class="secondary-button" data-action="close-seller-intake" ${state.sellerIntake.isSaving ? "disabled" : ""}>Cancel</button>
              <button type="submit" class="primary-button" ${state.sellerIntake.isSaving || aiSaveBlocked ? "disabled" : ""}>
                ${state.sellerIntake.isSaving ? `<span class="spinner" aria-hidden="true"></span> Saving item` : `${icon("arrow")} Save item`}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function renderAiSellerIntake(): string {
  const ai = state.sellerIntake.ai;
  const draft = state.sellerIntake.draft;
  const photo = state.sellerIntake.photo;
  const missingFields = getMissingSellerFields(draft);
  const captured = SELLER_REQUIRED_AI_FIELDS.length - missingFields.length;
  const progress = Math.round((captured / SELLER_REQUIRED_AI_FIELDS.length) * 100);
  const isListening = state.voice.isListening && activeVoiceCaptureTarget === "seller-intake";
  const itemName = [draft.brand, draft.model].filter(Boolean).join(" ");

  return `
    <div class="seller-ai-layout">
      <section class="seller-ai-chat" aria-labelledby="seller-ai-chat-title">
        <header class="seller-ai-chat__header">
          <div>
            <span class="seller-ai-live"><i></i>${escapeHtml(ai.trace?.model || state.serviceHealth.agentModel)}</span>
            <h3 id="seller-ai-chat-title">Describe your product naturally</h3>
          </div>
          <button type="button" class="seller-ai-restart" data-action="restart-seller-intake-ai" title="Start over">${icon("reset")}<span>Start over</span></button>
        </header>

        <div class="seller-ai-conversation" aria-live="polite">
          ${
            ai.messages.length
              ? ai.messages.map(renderSellerAiMessage).join("")
              : `<div class="seller-ai-welcome">
                  <span>${icon("spark")}</span>
                  <h4>Start with whatever you know</h4>
                  <p>Mention the product, condition, asking price, and location. Qwen will organize the details and ask only for what is missing.</p>
                  <button type="button" data-action="seller-intake-suggestion" data-message="I want to sell my black Sony WH-1000XM5 headphones in excellent condition for $220. They are in Tokyo with the original case and receipt, and I hope to sell within 14 days to a buyer in the United States. My name is Maya Chen and my email is maya@example.com.">Try an electronics example</button>
                </div>`
          }
          ${
            ai.isThinking
              ? `<div class="seller-ai-message seller-ai-message--assistant seller-ai-message--thinking"><span></span><span></span><span></span><small>Qwen is organizing your details</small></div>`
              : ""
          }
        </div>

        <div class="seller-ai-composer">
          <textarea data-field="seller-ai-message" rows="2" maxlength="2000" aria-label="Describe your product" placeholder="Example: I have black Sony headphones in excellent condition..." ${ai.isThinking ? "disabled" : ""}>${escapeHtml(ai.draft)}</textarea>
          <button
            type="button"
            class="seller-ai-mic ${isListening ? "is-active" : ""}"
            data-action="toggle-seller-intake-voice"
            aria-label="${isListening ? "Stop and transcribe" : "Describe item by voice"}"
            title="${isListening ? "Stop and transcribe" : "Describe item by voice"}"
            ${ai.isThinking || state.voice.isTranscribing ? "disabled" : ""}
          >${icon(isListening ? "stop" : "mic")}</button>
          <button
            type="button"
            class="seller-ai-send"
            data-action="send-seller-intake"
            aria-label="Send description"
            title="Send description"
            ${!ai.draft.trim() || ai.isThinking || isListening ? "disabled" : ""}
          >${icon("arrow")}</button>
        </div>
        <div class="seller-ai-input-status">
          <span>${escapeHtml(isListening || state.voice.isTranscribing ? state.voice.status : "Voice or text · details stay editable")}</span>
          ${state.voice.trace?.elapsedMs && activeVoiceCaptureTarget === "seller-intake" ? `<span>${state.voice.trace.elapsedMs} ms ASR</span>` : ""}
        </div>
      </section>

      <aside class="seller-ai-summary" aria-label="AI-filled listing details">
        <header>
          <div>
            <span>Listing details</span>
            <strong>${captured} of ${SELLER_REQUIRED_AI_FIELDS.length} required</strong>
          </div>
          <span class="seller-ai-summary__percent">${progress}%</span>
        </header>
        <progress class="seller-ai-progress" value="${captured}" max="${SELLER_REQUIRED_AI_FIELDS.length}" aria-label="${progress}% of required listing details captured">${progress}%</progress>

        <div class="seller-ai-facts">
          ${renderSellerAiFact("Item", itemName, ["brand", "model"])}
          ${renderSellerAiFact("Category", draft.category, ["category"])}
          ${renderSellerAiFact("Condition", draft.condition, ["condition"])}
          ${renderSellerAiFact("Color / material", [draft.color, draft.material].filter(Boolean).join(" · "), ["color"])}
          ${renderSellerAiFact("Asking price", draft.askingPriceUsd ? formatUsd(Number(draft.askingPriceUsd)) : "", ["askingPriceUsd"])}
          ${renderSellerAiFact("Seller", draft.sellerName, ["sellerName", "sellerEmail"])}
          ${renderSellerAiFact("Location / market", [draft.sellerLocation, draft.targetMarket].filter(Boolean).join(" → "), ["sellerLocation", "targetMarket"])}
          ${renderSellerAiFact("Sale timeline", draft.desiredSaleDays ? `${draft.desiredSaleDays} days` : "", ["desiredSaleDays"])}
        </div>

        <div class="seller-ai-missing ${missingFields.length ? "" : "is-ready"}">
          ${icon(missingFields.length ? "activity" : "check")}
          <span>
            <strong>${missingFields.length ? `${missingFields.length} details still needed` : "Details ready to review"}</strong>
            <small>${
              missingFields.length
                ? escapeHtml(missingFields.slice(0, 3).map(sellerFieldLabel).join(" · "))
                : "Check the extracted values before saving."
            }</small>
          </span>
        </div>

        <button type="button" class="seller-ai-review" data-action="review-ai-details">${icon("edit")}<span>Review all details</span></button>

        ${renderSellerAiPhoto(photo)}

        <label class="seller-ai-confirmation">
          <input data-seller-field="ownershipConfirmed" type="checkbox" ${draft.ownershipConfirmed ? "checked" : ""} required />
          <span>I own this item and have the right to sell it.</span>
        </label>
      </aside>
    </div>

    ${
      ai.error || state.sellerIntake.error || (state.voice.error && activeVoiceCaptureTarget === "seller-intake")
        ? `<div class="seller-ai-error" role="alert">${icon("warning")}<span>${escapeHtml(ai.error || state.sellerIntake.error || state.voice.error)}</span></div>`
        : ""
    }
  `;
}

function renderManualSellerIntake(): string {
  const draft = state.sellerIntake.draft;
  const photo = state.sellerIntake.photo;
  const currentYear = new Date().getFullYear();
  const sellerComplete = Boolean(draft.sellerName && draft.sellerEmail && draft.sellerLocation);

  return `
    <div class="seller-intake-progress" aria-label="Listing requirements">
      <span class="${sellerComplete ? "is-complete" : ""}">${sellerComplete ? icon("check") : "01"} Seller</span>
      <span class="${draft.brand && draft.model ? "is-complete" : ""}">02 Item</span>
      <span class="${photo ? "is-complete" : ""}">03 Photo</span>
    </div>

    <div class="seller-intake-form__scroll seller-intake-form__scroll--manual">
            <section class="seller-form-section" aria-labelledby="seller-details-heading">
              <div class="seller-form-section__title">
                <span>01</span>
                <div>
                  <h3 id="seller-details-heading">Your details</h3>
                  <p>Used for this private intake and human follow-up.</p>
                </div>
              </div>
              <div class="seller-form-grid">
                ${sellerTextInput("Full name", "sellerName", draft.sellerName, "Maya Chen", "text", true, "name")}
                ${sellerTextInput("Email", "sellerEmail", draft.sellerEmail, "maya@example.com", "email", true, "email")}
                ${sellerTextInput("Item location", "sellerLocation", draft.sellerLocation, "Tokyo, Japan", "text", true, "address-level2")}
                <label class="seller-field">
                  <span>Target buyer market</span>
                  <select data-seller-field="targetMarket" required>
                    <option value="" disabled ${draft.targetMarket ? "" : "selected"}>Select a market</option>
                    ${selectOption("United States", draft.targetMarket)}
                    ${selectOption("Japan", draft.targetMarket)}
                    ${selectOption("Germany", draft.targetMarket)}
                  </select>
                </label>
              </div>
            </section>

            <section class="seller-form-section" aria-labelledby="item-details-heading">
              <div class="seller-form-section__title">
                <span>02</span>
                <div>
                  <h3 id="item-details-heading">Item details</h3>
                  <p>Be precise. These facts ground Qwen's pricing and campaign work.</p>
                </div>
              </div>
              <div class="seller-form-grid seller-form-grid--item">
                ${sellerTextInput("Brand", "brand", draft.brand, "Sony", "text", true)}
                ${sellerTextInput("Model", "model", draft.model, "WH-1000XM5", "text", true)}
                <label class="seller-field">
                  <span>Category</span>
                  <select data-seller-field="category" required>
                    <option value="" disabled ${draft.category ? "" : "selected"}>Select a category</option>
                    ${["Electronics", "Fashion", "Home & Garden", "Beauty", "Collectibles", "Sports", "Industrial", "Handbag", "Watch", "Jewelry", "Accessories", "Other"].map((value) => selectOption(value, draft.category)).join("")}
                  </select>
                </label>
                <label class="seller-field">
                  <span>Condition</span>
                  <select data-seller-field="condition" required>
                    <option value="" disabled ${draft.condition ? "" : "selected"}>Select condition</option>
                    ${["New or unworn", "Excellent", "Very good", "Good", "Fair"].map((value) => selectOption(value, draft.condition)).join("")}
                  </select>
                </label>
                ${sellerTextInput("Color", "color", draft.color, "Black", "text", true)}
                ${sellerTextInput("Material", "material", draft.material, "Plastic and metal", "text", false)}
                ${sellerNumberInput("Year", "manufactureYear", draft.manufactureYear, "2023", 1900, currentYear, false)}
                <label class="seller-field seller-field--price">
                  <span>Asking price</span>
                  <div class="seller-price-input"><span>USD</span><input data-seller-field="askingPriceUsd" type="number" value="${escapeHtml(draft.askingPriceUsd)}" placeholder="220" min="1" max="10000000" step="1" inputmode="decimal" required /></div>
                </label>
                ${sellerNumberInput("Desired sale timeline", "desiredSaleDays", draft.desiredSaleDays, "30", 1, 365, true, "days")}
              </div>
              <label class="seller-field seller-field--wide">
                <span>Description</span>
                <textarea data-seller-field="description" rows="4" maxlength="1200" placeholder="Purchased in 2024, lightly used, fully working, includes the original case and charging cable." required>${escapeHtml(draft.description)}</textarea>
              </label>
              <label class="seller-field seller-field--wide">
                <span>Proof and included items <small>Optional</small></span>
                <textarea data-seller-field="authenticityNotes" rows="3" maxlength="600" placeholder="Original receipt and serial-number photo available; includes case and cable.">${escapeHtml(draft.authenticityNotes)}</textarea>
              </label>
            </section>

            <section class="seller-form-section seller-form-section--photo" aria-labelledby="item-photo-heading">
              <div class="seller-form-section__title">
                <span>03</span>
                <div>
                  <h3 id="item-photo-heading">Primary item photo</h3>
                  <p>PNG, JPEG, or WebP · 300 px minimum · under 5 MB</p>
                </div>
              </div>
              <div class="seller-photo-field ${photo ? "has-photo" : ""}">
                <label for="seller-photo">
                  ${
                    photo
                      ? `<img src="${escapeHtml(photo.dataUrl)}" alt="Selected item" />
                         <span class="seller-photo-field__replace">${icon("camera")} Replace photo</span>`
                      : `<span class="seller-photo-field__icon">${icon("camera")}</span>
                         <strong>Add a clear front photo</strong>
                         <small>Keep the full item visible in natural light.</small>`
                  }
                  <input id="seller-photo" data-seller-field="sellerPhoto" type="file" accept="image/png,image/jpeg,image/webp" ${photo ? "" : "required"} />
                </label>
                ${
                  photo
                    ? `<div class="seller-photo-field__meta">
                        <span><strong>${escapeHtml(photo.fileName)}</strong><small>${escapeHtml(formatBytes(photo.sizeBytes))}</small></span>
                        <button type="button" data-action="clear-seller-photo">${icon("trash")} Remove</button>
                      </div>`
                    : ""
                }
              </div>
            </section>

            <label class="seller-confirmation">
              <input data-seller-field="ownershipConfirmed" type="checkbox" ${draft.ownershipConfirmed ? "checked" : ""} required />
              <span>I confirm that I own this item and have the right to sell it.</span>
            </label>

            ${
              state.sellerIntake.error
                ? `<div class="seller-intake-error" role="alert">${icon("warning")}<span>${escapeHtml(state.sellerIntake.error)}</span></div>`
                : ""
            }
    </div>
  `;
}

function renderSellerAiMessage(message: SellerIntakeAssistantMessage): string {
  return `
    <div class="seller-ai-message seller-ai-message--${message.role}">
      <span>${message.role === "assistant" ? icon("spark") : "You"}</span>
      <p>${escapeHtml(message.content)}</p>
    </div>
  `;
}

function renderSellerAiFact(
  label: string,
  value: string,
  fields: SellerIntakeFieldName[]
): string {
  const complete = fields.every((field) => !getMissingSellerFields(state.sellerIntake.draft).includes(field));

  return `
    <div class="seller-ai-fact ${complete ? "is-complete" : ""}">
      <span>${complete ? icon("check") : icon("activity")}</span>
      <div>
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value || "Not captured")}</strong>
      </div>
    </div>
  `;
}

function renderSellerAiPhoto(photo: UploadedMedia | null): string {
  return `
    <div class="seller-ai-photo ${photo ? "has-photo" : ""}">
      <label for="seller-ai-photo">
        ${
          photo
            ? `<img src="${escapeHtml(photo.dataUrl)}" alt="Selected item" /><span>${icon("camera")} Replace photo</span>`
            : `${icon("camera")}<span><strong>Add item photo</strong><small>Required before saving</small></span>`
        }
        <input id="seller-ai-photo" data-seller-field="sellerPhoto" type="file" accept="image/png,image/jpeg,image/webp" ${photo ? "" : "required"} />
      </label>
      ${photo ? `<button type="button" data-action="clear-seller-photo" title="Remove photo" aria-label="Remove photo">${icon("trash")}</button>` : ""}
    </div>
  `;
}

function sellerIntakeFooterStatus(missingFields: SellerIntakeFieldName[]): string {
  if (state.sellerIntake.mode === "manual") return "Saved to the private QuoteX SQLite workspace";
  if (missingFields.length) return `${missingFields.length} required details remaining`;
  if (!state.sellerIntake.photo) return "Details complete · add a photo";
  if (!state.sellerIntake.draft.ownershipConfirmed) return "Details complete · confirm ownership";
  return "Reviewed details will be saved to SQLite";
}

function sellerTextInput(
  label: string,
  field: SellerTextField,
  value: string,
  placeholder: string,
  type: "text" | "email",
  required: boolean,
  autocomplete = "off"
): string {
  return `
    <label class="seller-field">
      <span>${escapeHtml(label)}${required ? "" : " <small>Optional</small>"}</span>
      <input data-seller-field="${escapeHtml(field)}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="160" autocomplete="${escapeHtml(autocomplete)}" ${required ? "required" : ""} />
    </label>
  `;
}

function sellerNumberInput(
  label: string,
  field: SellerTextField,
  value: string,
  placeholder: string,
  minimum: number,
  maximum: number,
  required: boolean,
  suffix = ""
): string {
  return `
    <label class="seller-field">
      <span>${escapeHtml(label)}${required ? "" : " <small>Optional</small>"}</span>
      <div class="seller-number-input">
        <input data-seller-field="${escapeHtml(field)}" type="number" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" min="${minimum}" max="${maximum}" step="1" inputmode="numeric" ${required ? "required" : ""} />
        ${suffix ? `<span>${escapeHtml(suffix)}</span>` : ""}
      </div>
    </label>
  `;
}

function selectOption(value: string, selectedValue: string): string {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`;
}

function renderTimelinePanel(): string {
  const timeline = state.analysis
    ? state.analysis.timeline.slice(0, state.visibleStageCount)
    : [];
  const isSellerListing = Boolean(getSelectedListing());

  return `
    <section class="panel agent-panel">
      <div class="panel__header">
        <div>
            <p class="eyebrow">03 / Decision evidence</p>
            <h2>Autopilot run</h2>
        </div>
        <span class="status-pill">${state.isRunning ? "Processing" : timeline.length ? "Ready" : "Idle"}</span>
      </div>
      <div class="timeline">
        ${
          timeline.length
            ? timeline.map(renderTimelineStep).join("")
            : renderEmptyState(
                "Ready to run",
                isSellerListing
                  ? "Build the sale plan to structure the product, price, verification gate, and insured route."
                  : "Select a buyer request above, then run Autopilot to see each decision step."
              )
        }
      </div>
    </section>
  `;
}

function renderTimelineStep(step: TimelineStep): string {
  return `
    <article class="timeline-step">
      <div class="timeline-step__rail">
        <span>${icon("node")}</span>
      </div>
      <div class="timeline-step__body">
        <div class="timeline-step__topline">
          <strong>${escapeHtml(step.role)}</strong>
          <span class="execution-chip execution-chip--${escapeHtml(step.executionType || "deterministic-tool")}">${escapeHtml(
            executionLabel(step.executionType)
          )}</span>
          <span>${Math.round(step.confidence * 100)}% confidence</span>
        </div>
        <h3>${escapeHtml(step.title)}</h3>
        <p>${escapeHtml(step.summary)}</p>
        <div class="evidence-list">
          ${step.evidence.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
        <div class="tool-row">
          ${step.toolReads.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderDecisionPanel(customer: Customer): string {
  if (!state.analysis) {
    return `
      <section class="panel decision-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">04 / Human checkpoint</p>
            <h2>Approval checkpoint</h2>
          </div>
        </div>
        ${renderRouteAsset(customer)}
      </section>
    `;
  }

  const { analysis } = state;
  const approved = analysis.approval.status === "approved";
  const followup = getFollowupRfq(analysis.rfq);
  const sellerListing = analysis.rfq.source === "seller-listing";

  return `
    <section class="panel decision-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">04 / Human checkpoint</p>
          <h2>Approval checkpoint</h2>
        </div>
        <span class="status-pill status-pill--${approved ? "success" : "warning"}">
          ${approved ? "Approved" : "Pending"}
        </span>
      </div>
      <div class="risk-stack">
        ${
          analysis.risks.length
            ? analysis.risks.map(renderRisk).join("")
            : `<div class="risk risk--low"><strong>No blocking risk</strong><span>Policy still requires review before sending.</span></div>`
        }
      </div>
      <button class="approval-button" data-action="approve-quote" ${approved ? "disabled" : ""}>
        ${icon("check")}
        <span>${
          approved
            ? sellerListing ? "Sale plan approved" : "Quote approved"
            : sellerListing ? "Approve sale plan" : "Approve quote"
        }</span>
      </button>
      ${
        approved && followup
          ? `<button class="memory-replay-button" data-action="select-rfq" data-rfq-id="${escapeHtml(
              followup.id
            )}">${icon("memory")}<span>Test the next RFQ with this memory</span></button>`
          : ""
      }
      ${renderRouteAsset(customer)}
    </section>
  `;
}

function renderRisk(risk: QuoteRisk): string {
  return `
    <div class="risk risk--${risk.level}">
      <strong>${escapeHtml(risk.title)}</strong>
      <span>${escapeHtml(risk.detail)}</span>
    </div>
  `;
}

function renderQuotePanel(): string {
  if (!state.analysis) {
    return panelPlaceholder("Quote", "No quote generated");
  }

  const { quote, shipping } = state.analysis;
  const sellerListing = state.analysis.rfq.source === "seller-listing";

  return `
    <section class="panel quote-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">${sellerListing ? "Buyer-facing estimate" : "Commercial Offer"}</p>
          <h2>${escapeHtml(quote.sku)}</h2>
        </div>
        <span class="status-pill">${Math.round(quote.margin * 100)}% margin</span>
      </div>
      <dl class="quote-table">
        ${quoteLine("Product", quote.productName)}
        ${quoteLine("Quantity", quote.quantity.toLocaleString("en-US"))}
        ${quoteLine(sellerListing ? "Seller asking price" : "Unit price", formatUsd(quote.unitPrice))}
        ${quoteLine(sellerListing ? "Item subtotal" : "Goods total", formatUsd(quote.goodsTotal))}
        ${quoteLine("Freight", `${shipping.carrier}, ${shipping.days} days`)}
        ${quoteLine("Payment", quote.paymentTerms)}
        ${quoteLine("Landed total", formatUsd(quote.landedTotal), true)}
      </dl>
    </section>
  `;
}

function renderDraftPanel(): string {
  if (!state.analysis) {
    return panelPlaceholder("Draft", "No message drafted");
  }

  return `
    <section class="panel draft-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">${state.analysis.rfq.source === "seller-listing" ? "Seller confirmation" : "Outbound Draft"}</p>
          <h2>${state.analysis.rfq.source === "seller-listing" ? "Private intake receipt" : "Buyer reply"}</h2>
        </div>
      </div>
      <pre>${escapeHtml(state.analysis.draftEmail)}</pre>
    </section>
  `;
}

function renderMediaPanel(): string {
  const media = state.productMedia;

  return `
    <section class="panel media-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Media Intake</p>
          <h2>Product photo</h2>
        </div>
        <span class="status-pill">${media ? "Uploaded" : "Waiting"}</span>
      </div>
      <div class="media-upload">
        <label class="upload-zone" for="product-media">
          ${media ? renderMediaPreview(media) : renderEmptyState("Upload product media", "PNG, JPEG, or WebP under 5 MB.")}
          <input id="product-media" data-field="product-media" type="file" accept="image/png,image/jpeg,image/webp" />
        </label>
        ${
          media
            ? `<div class="media-meta">
                <strong>${escapeHtml(media.fileName)}</strong>
                <span>${escapeHtml(media.mimeType)} &middot; ${formatBytes(media.sizeBytes)}</span>
                <button class="secondary-button" data-action="clear-media">
                  ${icon("trash")}
                  <span>Remove</span>
                </button>
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderCreativePanel(): string {
  const asset = state.marketingAsset;
  const trace = state.marketingTrace;
  const canGenerate = Boolean(state.productMedia && state.analysis) && !state.isGeneratingCreative;
  const canGenerateVideo = Boolean(
    getProductVideoFirstFrame() &&
    state.serviceHealth.videoConfigured &&
    !state.isGeneratingVideo
  );
  const studioStatus = state.isGeneratingVideo
    ? "Rendering video"
    : state.productVideo?.status === "SUCCEEDED"
      ? "Video ready"
      : state.isGeneratingCreative
        ? "Generating image"
        : trace?.status === "live-image-edit"
          ? "Image ready"
          : trace?.status === "fallback-edit"
            ? "Local preview"
            : trace?.status || "Idle";
  const statusTone = state.productVideo?.status === "SUCCEEDED" || trace?.status === "live-image-edit"
    ? "success"
    : state.videoError || state.creativeError || trace?.error
      ? "warning"
      : "";

  return `
    <section class="panel creative-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">AI Marketing Studio</p>
          <h2>Campaign image + video</h2>
        </div>
        <span class="status-pill ${statusTone ? `status-pill--${statusTone}` : ""}">
          ${escapeHtml(studioStatus)}
        </span>
      </div>
      <div class="creative-body">
        ${
          asset
            ? `<img class="creative-image" src="${escapeHtml(asset.imageDataUrl)}" alt="Campaign asset preview" />`
            : renderEmptyState(
                "No campaign asset",
                getSelectedListing()
                  ? "Build the sale plan, then create the buyer-facing campaign image."
                  : "No generated image is associated with this quote."
              )
        }
        ${renderProductVideoStage()}
        <div class="creative-actions">
          <button class="primary-button" data-action="generate-creative" ${canGenerate ? "" : "disabled"}>
            ${icon("spark")}
            <span>${state.isGeneratingCreative ? "Generating image" : "Create campaign image"}</span>
          </button>
          <button
            class="secondary-button"
            data-action="generate-product-video"
            ${canGenerateVideo ? "" : "disabled"}
            title="${state.serviceHealth.videoConfigured ? "Animate the current campaign frame" : "HappyHorse API access is not configured"}"
          >
            ${icon(state.isGeneratingVideo ? "stop" : "play")}
            <span>${state.isGeneratingVideo ? "Rendering video" : "Animate with HappyHorse"}</span>
          </button>
          ${
            asset
              ? `<a class="secondary-button secondary-button--link" href="${escapeHtml(asset.imageDataUrl)}" download="${escapeHtml(
                  asset.fileName
                )}">
                  ${icon("download")}
                  <span>Download</span>
                </a>`
              : ""
          }
        </div>
        ${
          state.creativeError
            ? `<div class="risk risk--medium"><strong>Creative service</strong><span>${escapeHtml(
                state.creativeError
              )}</span></div>`
            : ""
        }
        ${
          state.videoError
            ? `<div class="risk risk--medium"><strong>HappyHorse video</strong><span>${escapeHtml(
                state.videoError
              )}</span></div>`
            : ""
        }
        ${
          trace?.error && trace.status !== "live-image-edit"
            ? `<div class="risk risk--medium"><strong>Qwen image edit</strong><span>${escapeHtml(
                trace.error
              )}</span></div>`
            : ""
        }
        ${asset ? renderCreativeBrief(asset.brief, trace) : ""}
      </div>
    </section>
  `;
}

function renderMarketplacePanel(): string {
  const savedListing = getSelectedListing();
  const listing = savedListing || buildCatalogMarketplaceListing();

  if (!listing) {
    return `
      <section class="panel marketplace-panel">
        <div class="panel__header">
          <div><p class="eyebrow">Sales channels</p><h2>Marketplace drafts</h2></div>
          <span class="status-pill">Waiting</span>
        </div>
        ${renderEmptyState("Add or select a product", "Marketplace exports use the verified seller listing, offer, and campaign asset.")}
      </section>
    `;
  }

  const drafts = buildMarketplaceDrafts({
    listing,
    analysis: state.analysis,
    asset: state.marketingAsset
  });

  return `
    <section class="panel marketplace-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Sales channels</p>
          <h2>Amazon, eBay, and Alibaba drafts</h2>
        </div>
        <span class="status-pill status-pill--success">${drafts.length} adapters ready</span>
      </div>
      <div class="marketplace-intro">
        <span>${icon("database")}</span>
        <p>One verified ${savedListing ? "seller record" : "catalog offer"} becomes three platform-specific payloads. QuoteX validates missing fields now; publishing stays disabled until marketplace OAuth and human approval are complete.</p>
      </div>
      <div class="marketplace-drafts">
        ${drafts.map(renderMarketplaceDraft).join("")}
      </div>
    </section>
  `;
}

function buildCatalogMarketplaceListing(): SellerListing | null {
  const analysis = state.analysis;
  if (!analysis || analysis.rfq.source === "seller-listing") return null;

  const product = analysis.selectedProduct.product;
  const targetMarket =
    analysis.customer.market === "Japan" ||
    analysis.customer.market === "United States" ||
    analysis.customer.market === "Germany"
      ? analysis.customer.market
      : "United States";
  const now = new Date().toISOString();
  const category: SellerListing["category"] =
    product.category.toLowerCase().includes("textile") ? "Fashion" : "Industrial";

  return {
    id: `catalog-${product.sku.toLowerCase()}`,
    sellerName: "QuoteX export workspace",
    sellerEmail: "private@quotex.local",
    sellerLocation: analysis.rfq.origin || product.origin,
    targetMarket,
    brand: product.origin === "MN" ? "Mongolian Cashmere" : product.name,
    model: product.origin === "MN" ? "Grade-A Scarf" : product.sku,
    category,
    condition: "New or unworn",
    color:
      product.sku === "MNG-CASH-SCF"
        ? "Charcoal, forest green, natural oat"
        : "Buyer selected",
    material: product.sku === "MNG-CASH-SCF" ? "100% cashmere" : product.category,
    manufactureYear: new Date().getFullYear(),
    askingPriceUsd: analysis.quote.unitPrice,
    desiredSaleDays: analysis.parsed.deadlineDays,
    description: `${analysis.quote.quantity.toLocaleString("en-US")} units of ${product.name} for ${analysis.customer.company}. ${product.certification.join(". ")}.`,
    authenticityNotes: product.certification.join("; "),
    ownershipConfirmed: true,
    status: "ready",
    photo: {
      fileName: state.productMedia?.fileName || "catalog-product.png",
      mimeType: state.productMedia?.mimeType || "image/png",
      sizeBytes: state.productMedia?.sizeBytes || 0,
      url: FLAGSHIP_RFQ_IDS.has(analysis.rfq.id) ? FLAGSHIP_MEDIA_URL : "catalog-photo-pending"
    },
    createdAt: now,
    updatedAt: now
  };
}

function renderMarketplaceDraft(draft: MarketplaceDraft): string {
  const downloadPayload = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(draft.payload, null, 2))}`;

  return `
    <article class="marketplace-draft marketplace-draft--${draft.id}">
      <header>
        <div>
          <span>${escapeHtml(draft.audience)}</span>
          <h3>${escapeHtml(draft.name)}</h3>
        </div>
        <span class="marketplace-draft__mode">Draft only</span>
      </header>
      <strong class="marketplace-draft__title">${escapeHtml(draft.title)}</strong>
      <dl>
        ${draft.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`).join("")}
      </dl>
      <div class="marketplace-missing">
        <span>Before publish</span>
        <p>${escapeHtml(draft.missingFields.join(" · "))}</p>
      </div>
      <footer>
        <small>${escapeHtml(draft.warnings[0] || "Marketplace validation is required.")}</small>
        <a class="secondary-button secondary-button--link" href="${escapeHtml(downloadPayload)}" download="quotex-${draft.id}-draft.json">
          ${icon("download")}
          <span>Export JSON</span>
        </a>
      </footer>
    </article>
  `;
}

function renderProductVideoStage(): string {
  const video = state.productVideo;
  if (!video) return "";

  if (video.status === "SUCCEEDED" && video.videoUrl) {
    return `
      <section class="product-video-result" aria-label="Generated product campaign video">
        <div class="product-video-result__header">
          <div>
            <span>HappyHorse result</span>
            <strong>${escapeHtml(video.model)}</strong>
          </div>
          <span>${video.duration}s · ${escapeHtml(video.resolution)}</span>
        </div>
        <video
          class="creative-video"
          controls
          playsinline
          preload="metadata"
          ${state.marketingAsset ? `poster="${escapeHtml(state.marketingAsset.imageDataUrl)}"` : ""}
          src="${escapeHtml(video.videoUrl)}"
        ></video>
        <div class="product-video-result__footer">
          <span>Task ${escapeHtml(video.taskId.slice(0, 12))}</span>
          <a class="secondary-button secondary-button--link" href="${escapeHtml(video.videoUrl)}" target="_blank" rel="noopener noreferrer">
            ${icon("play")}
            <span>Open video</span>
          </a>
        </div>
      </section>
    `;
  }

  return `
    <div class="video-generation-status" role="status" aria-live="polite">
      <span class="video-generation-status__signal" aria-hidden="true"></span>
      <div>
        <strong>${video.status === "RUNNING" ? "HappyHorse is rendering" : "HappyHorse task queued"}</strong>
        <span>${escapeHtml(video.model)} · ${video.duration}s ${escapeHtml(video.resolution)} · task ${escapeHtml(video.taskId.slice(0, 12))}</span>
      </div>
    </div>
  `;
}

function renderMediaPreview(media: UploadedMedia): string {
  return `
    <div class="media-preview">
      <img src="${escapeHtml(media.dataUrl)}" alt="Uploaded product" />
      <span>${icon("upload")}</span>
    </div>
  `;
}

function renderCreativeBrief(brief: MarketingBrief, trace: QwenTrace | null): string {
  const notes = brief.complianceNotes || [];
  const route = trace?.attemptedModels?.length
    ? trace.attemptedModels.join(" → ")
    : trace?.model || state.serviceHealth.imageModel;
  const persistence = trace?.assetPersistence === "embedded-data-url"
    ? "Saved in this session"
    : trace?.assetPersistence === "provider-url"
      ? "Temporary provider URL"
      : trace?.status === "fallback-edit" || trace?.status === "missing-key"
        ? "No AI asset generated"
        : "Awaiting generated asset";
  const resultModel = trace?.status === "live-image-edit"
    ? trace.model || state.serviceHealth.imageModel
    : "Local layout";

  return `
    <div class="creative-route" aria-label="Qwen creative model route">
      <div>
        <span>1 · Understand photo</span>
        <strong>${escapeHtml(trace?.briefingModel || state.serviceHealth.visionModel)}</strong>
      </div>
      <div>
        <span>2 · Edit product image</span>
        <strong>${escapeHtml(route)}</strong>
      </div>
      <div>
        <span>3 · Preserve result</span>
        <strong>${escapeHtml(persistence)}</strong>
      </div>
    </div>
    <div class="creative-brief">
      <div>
        <span>Headline</span>
        <strong>${escapeHtml(brief.headline)}</strong>
      </div>
      <div>
        <span>CTA</span>
        <strong>${escapeHtml(brief.cta)}</strong>
      </div>
      <div>
        <span>Image result</span>
        <strong>${escapeHtml(resultModel)}</strong>
      </div>
      <p>${escapeHtml(brief.visualPrompt)}</p>
      ${notes.length ? `<p>${escapeHtml(notes.join(" "))}</p>` : ""}
    </div>
  `;
}

function traceFact(label: string, value: string): string {
  return `
    <div class="trace-fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderMemoryPanel(customer: Customer): string {
  const memories = customer.memory;
  const learnedCount = state.memoryStore[customer.id]?.length || 0;

  return `
    <section class="panel memory-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Persistent Memory</p>
          <h2>${escapeHtml(customer.company)}</h2>
        </div>
        <div class="memory-header-actions">
          <span class="status-pill">${memories.length} facts · ${learnedCount} learned</span>
          ${
            learnedCount
              ? `<button class="text-button" data-action="clear-customer-memory">Clear learned</button>`
              : ""
          }
        </div>
      </div>
      <p class="memory-persistence-note">Approved outcomes persist in this browser for future RFQs. Old learned facts expire after 365 days and the store is capped per customer.</p>
      <div class="memory-list">
        ${memories.map(renderMemory).join("")}
      </div>
    </section>
  `;
}

function renderLearningPanel(): string {
  const approvals = state.approvedAnalyses;

  return `
    <section class="panel learning-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Experience</p>
          <h2>Quote outcomes</h2>
        </div>
      </div>
      <div class="outcome-list">
        ${
          approvals.length
            ? approvals.map(renderOutcome).join("")
            : renderEmptyState("No approvals yet", "Awaiting quote outcomes.")
        }
      </div>
    </section>
  `;
}

function renderMemory(memory: MemoryRecord): string {
  return `
    <article class="memory-item">
      <div>
        <strong>${escapeHtml(memory.title)}</strong>
        <span>${escapeHtml(memory.evidence)}</span>
      </div>
      <meter min="0" max="1" value="${memory.confidence}" aria-label="Memory confidence"></meter>
    </article>
  `;
}

function renderOutcome(analysis: Analysis): string {
  return `
    <article class="outcome-item">
      <strong>${escapeHtml(analysis.customer.company)}</strong>
      <span>${escapeHtml(analysis.quote.sku)} approved at ${formatUsd(analysis.quote.landedTotal)}</span>
    </article>
  `;
}

function executionLabel(type: ExecutionType | undefined): string {
  const labels: Record<ExecutionType, string> = {
    "qwen-cloud": "Qwen Cloud",
    "resilient-fallback": "Fallback",
    "deterministic-tool": "Verified tool",
    "human-checkpoint": "Human gate",
    "memory-write": "Memory write"
  };

  return type ? labels[type] : "Verified tool";
}

function renderRouteAsset(customer: Customer): string {
  const selectedRfq = getSelectedRfqBase();
  const market = customer.market;
  const sellerListing = selectedRfq.source === "seller-listing";
  const analyzedRoute = state.analysis?.shipping.route.split(" -> ");
  const origin = analyzedRoute?.[0] || (
    selectedRfq.origin || (sellerListing ? "Seller" : "Supplier")
  );
  const destination = analyzedRoute?.[1] || (
    sellerListing
      ? market
      : selectedRfq.destination || (market === "Japan" ? "Yokohama" : market === "Germany" ? "Hamburg" : "Los Angeles")
  );

  return `
    <div class="route-asset" aria-label="Shipment route visualization">
      <div class="route-asset__port route-asset__port--origin">
        <strong>${escapeHtml(origin)}</strong>
        <span>${sellerListing ? "Seller" : "Warehouse"}</span>
      </div>
      <div class="route-asset__line">
        <span></span>
      </div>
      <div class="route-asset__port route-asset__port--destination">
        <strong>${escapeHtml(destination)}</strong>
        <span>${sellerListing ? "Target market" : escapeHtml(customer.market)}</span>
      </div>
    </div>
  `;
}

function panelPlaceholder(title: string, text: string): string {
  return `
    <section class="panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">${escapeHtml(title)}</p>
          <h2>${escapeHtml(text)}</h2>
        </div>
      </div>
      ${renderEmptyState(text, "No active analysis payload.")}
    </section>
  `;
}

function renderEmptyState(title: string, text: string): string {
  return `
    <div class="empty-state">
      ${icon("empty")}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function tab(view: WorkspaceView, label: string): string {
  return `
    <button
      class="view-tab ${state.selectedView === view ? "is-active" : ""}"
      data-action="set-view"
      data-view="${view}"
      role="tab"
      aria-selected="${state.selectedView === view}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function quoteLine(label: string, value: string | number, isTotal = false): string {
  return `
    <div class="${isTotal ? "is-total" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function icon(name: string): string {
  const icons: Record<string, string> = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L21 7.6l-1.4-1.4z"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9l3.3-3.3 1.4 1.4L12 15.8l-5.7-5.7 1.4-1.4L11 12V3Zm-6 14h2v2h10v-2h2v4H5v-4Z"/></svg>',
    mic:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Zm-2 4a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0V7Zm-5 4h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11Z"/></svg>',
    speaker:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4V9Zm2 2v2h2.7l2.3 1.8V9.2L8.7 11H6Zm9.5-3.5a6.4 6.4 0 0 1 0 9l-1.4-1.4a4.4 4.4 0 0 0 0-6.2l1.4-1.4Zm2.8-2.8a10.4 10.4 0 0 1 0 14.6l-1.4-1.4a8.4 8.4 0 0 0 0-11.8l1.4-1.4Z"/></svg>',
    stop:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6V6Z"/></svg>',
    memory:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7v2.2A3 3 0 0 0 6 17h1v3a2 2 0 0 0 2 2h3v-2H9v-5H6a1 1 0 1 1 0-2h1V9a5 5 0 1 1 5 5h-2v2h2a7 7 0 0 0 0-14Zm-2 5h2v2h2v2h-4V7Z"/></svg>',
    node:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-4.8 6.4l-3.5 2A4 4 0 1 0 5 17.9l3.7-2.1a5 5 0 0 0 6.6 0l3.7 2.1a4 4 0 1 0 1.3-7.5l-3.5-2A5 5 0 0 0 12 2Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM4 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm16 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-8 1a5 5 0 0 0 1.7-.3l3.5 2-2.9 1.7a5 5 0 0 0-4.6 0l-2.9-1.7 3.5-2A5 5 0 0 0 12 13Z"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4H3.6A9 9 0 1 0 6 5.7V3H4v6h6V7H7.5A7 7 0 0 1 12 5Z"/></svg>',
    edit:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15.7 3.3 5 5L9 20H4v-5L15.7 3.3Zm0 2.8L6 15.8V18h2.2l9.7-9.7-2.2-2.2ZM18.5 2l3.5 3.5-1.4 1.4-3.5-3.5L18.5 2Z"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Zm6 11 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z"/></svg>',
    database:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-5 0-9 1.8-9 4v10c0 2.2 4 4 9 4s9-1.8 9-4V7c0-2.2-4-4-9-4Zm0 2c4.4 0 7 1.4 7 2s-2.6 2-7 2-7-1.4-7-2 2.6-2 7-2Zm0 6c2.8 0 5.3-.6 7-1.6V12c0 .6-2.6 2-7 2s-7-1.4-7-2V9.4c1.7 1 4.2 1.6 7 1.6Zm0 8c-4.4 0-7-1.4-7-2v-2.6c1.7 1 4.2 1.6 7 1.6s5.3-.6 7-1.6V17c0 .6-2.6 2-7 2Z"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5.1-3.4 9.7-8 11-4.6-1.3-8-5.9-8-11V5l8-3Zm0 2.1L6 6.3V11c0 4 2.5 7.6 6 8.8 3.5-1.2 6-4.8 6-8.8V6.3l-6-2.2Zm-1.1 9.7-2.7-2.7 1.4-1.4 1.3 1.3 3.5-3.5 1.4 1.4-4.9 4.9Z"/></svg>',
    camera:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5 10 3h4l1.5 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5ZM4 7v11h16V7h-5.5L13 5h-2L9.5 7H4Zm8 2.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>',
    paperclip:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5 8.7 14.3a2.5 2.5 0 0 0 3.5 3.5l8.1-8.1a4.5 4.5 0 0 0-6.4-6.4L5.5 11.7a6.5 6.5 0 0 0 9.2 9.2l6.1-6.1-1.4-1.4-6.1 6.1a4.5 4.5 0 0 1-6.4-6.4l8.4-8.4a2.5 2.5 0 0 1 3.6 3.6l-8.1 8.1a.5.5 0 0 1-.7-.7L17.9 8l-1.4-1.5Z"/></svg>',
    lock:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h2v11H5V10h2Zm2 0h6V7a3 3 0 1 0-6 0v3Zm3 3a2 2 0 0 0-1 3.7V19h2v-2.3A2 2 0 0 0 12 13Z"/></svg>',
    activity:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h4l2-6 4 13 2-7h6v2h-4.4l-3.4 11L9 10.5 8.4 13H3v-2Z"/></svg>',
    transcript:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h14v18H5V3Zm2 2v14h10V5H7Zm2 3h6v2H9V8Zm0 4h6v2H9v-2Zm0 4h4v2H9v-2Z"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 8.3 5.3 5.3 5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7 1.4-1.4Z"/></svg>',
    "phone-off":
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.7 2.3 18 18-1.4 1.4-3.1-3.1c-4.3 1-10.8-5.5-11.8-9.8L2.3 5.7l1.4-1.4 2.8 2.8 2.4-1.4 3.4 3.4-1.5 2.5c.8 1 1.8 2 2.8 2.8l1.2-.7L2.3 3.7l1.4-1.4Zm15.1 12.1 2.9 2.9-1.4 1.4-3-3 1.5-1.3Z"/></svg>',
    quote:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4V4Zm2 2v12h12V6H6Zm2 2h8v2H8V8Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 10 18H2L12 3Zm0 4.1L5.4 19h13.2L12 7.1ZM11 10h2v5h-2v-5Zm0 6h2v2h-2v-2Z"/></svg>',
    route:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4a4 4 0 0 1 3.5 5.9l4.1 4.1A4 4 0 1 1 13 17c0-.5.1-.9.2-1.3L9.1 11.6A4 4 0 1 1 7 4Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 12H7.7L7 9Zm3 2 .3 8h1.8l-.3-8H10Zm3.8 0-.3 8h1.8l.3-8h-1.8Z"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h2V8.8l3.3 3.3 1.4-1.4L12 5l-5.7 5.7 1.4 1.4L11 8.8V17Zm-6 2h14v2H5v-2Z"/></svg>',
    sun:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2v3h-2V2Zm0 17h2v3h-2v-3ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
    moon:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 9 9 0 1 0 20.2 15.2ZM5 12a7 7 0 0 1 1.2-3.9 10.5 10.5 0 0 0 9.7 9.7A7 7 0 0 1 5 12Z"/></svg>',
    menu:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.7 5.3 5.3 5.3 5.3-5.3 1.4 1.4-5.3 5.3 5.3 5.3-1.4 1.4-5.3-5.3-5.3 5.3-1.4-1.4 5.3-5.3-5.3-5.3 1.4-1.4Z"/></svg>',
    arrow:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3 1.4-1.4Z"/></svg>',
    empty:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 2h8v2H8V9Zm0 4h5v2H8v-2Z"/></svg>'
  };

  return icons[name] || "";
}

function getSelectedRfq(): RfqScenario {
  const rfq = getSelectedRfqBase();
  const rawMessage = getRfqDraft(rfq);

  return {
    ...rfq,
    rawMessage,
    isCustomDraft: rawMessage.trim() !== rfq.rawMessage.trim()
  };
}

function getSelectedRfqBase(): RfqScenario {
  if (state.selectedRfqId === SELLER_ONBOARDING_ID) return SELLER_ONBOARDING_RFQ;
  return getAllRfqScenarios().find((rfq) => rfq.id === state.selectedRfqId) || rfqScenarios[0]!;
}

function getRfqDraft(rfq: RfqScenario): string {
  return state.rfqDrafts[rfq.id] ?? rfq.rawMessage;
}

function getCustomer(customerId: string): Customer {
  if (customerId === SELLER_ONBOARDING_ID) {
    return {
      id: SELLER_ONBOARDING_ID,
      company: "Your seller workspace",
      contact: "Seller",
      market: "Global",
      language: "English",
      paymentTerms: "Set after item intake",
      creditLimitUsd: 0,
      relationship: "New seller",
      memory: []
    };
  }

  const listing = state.listings.items.find(
    (candidate) => listingCustomerId(candidate.id) === customerId
  );
  if (listing) {
    return withLearnedMemories(
      {
        id: customerId,
        company: `${listing.sellerName} · private seller`,
        contact: listing.sellerName,
        market: listing.targetMarket,
        language: "English",
        paymentTerms: "Marketplace checkout after buyer approval",
        creditLimitUsd: Math.max(10_000, listing.askingPriceUsd * 2),
        relationship: "New seller",
        memory: [
          {
            id: `listing-intake-${listing.id}`,
            type: "seller_intake",
            title: `Seller asks ${formatUsd(listing.askingPriceUsd)} and wants a sale within ${listing.desiredSaleDays} days`,
            evidence: `Saved from the verified seller intake on ${formatShortDate(listing.createdAt)}.`,
            confidence: 1,
            updatedAt: listing.updatedAt.slice(0, 10)
          }
        ]
      },
      state.memoryStore
    );
  }

  const customer = customers.find((candidate) => candidate.id === customerId) || customers[0]!;
  return withLearnedMemories(customer, state.memoryStore);
}

function getFollowupRfq(currentRfq: RfqScenario): RfqScenario | undefined {
  if (currentRfq.source === "seller-listing") return undefined;
  return rfqScenarios.find(
    (rfq) => rfq.customerId === currentRfq.customerId && rfq.id !== currentRfq.id && rfq.demoLabel
  );
}

function getAllRfqScenarios(): RfqScenario[] {
  return [...state.listings.items.map(listingToRfq), ...rfqScenarios];
}

function getSelectedListing(): SellerListing | null {
  const id = state.selectedRfqId.startsWith("listing:")
    ? state.selectedRfqId.slice("listing:".length)
    : "";
  return state.listings.items.find((listing) => listing.id === id) || null;
}

function listingToRfq(listing: SellerListing): RfqScenario {
  const year = listing.manufactureYear ? `${listing.manufactureYear} ` : "";
  const material = listing.material ? ` in ${listing.material}` : "";
  const authenticity = listing.authenticityNotes
    ? ` Authentication evidence: ${listing.authenticityNotes}`
    : " Authentication documents still need human review.";

  return {
    id: listingScenarioId(listing.id),
    customerId: listingCustomerId(listing.id),
    receivedAt: listing.createdAt,
    channel: "Seller portal",
    subject: `${listing.brand} ${listing.model} · ${listing.condition}`,
    rawMessage: [
      `I want to sell 1 item: a ${year}${listing.brand} ${listing.model}, ${listing.color}${material}.`,
      `It is in ${listing.condition.toLowerCase()} condition and my asking price is USD ${listing.askingPriceUsd}.`,
      `The item is located in ${listing.sellerLocation}; target buyer market is ${listing.targetMarket}.`,
      `I would like to sell within ${listing.desiredSaleDays} days.`,
      listing.description,
      authenticity
    ].join(" "),
    expectedQuantity: 1,
    origin: listing.sellerLocation,
    destination: `${listing.targetMarket} marketplace`,
    deadlineDays: listing.desiredSaleDays,
    priority: listing.desiredSaleDays <= 14 ? "High" : "Medium",
    demoLabel: "Saved listing",
    source: "seller-listing",
    listingId: listing.id
  };
}

function listingScenarioId(id: string): string {
  return `listing:${id}`;
}

function listingCustomerId(id: string): string {
  return `seller:${id}`;
}

function createEmptySellerDraft(): SellerIntakeDraft {
  return {
    sellerName: "",
    sellerEmail: "",
    sellerLocation: "",
    targetMarket: "",
    brand: "",
    model: "",
    category: "",
    condition: "",
    color: "",
    material: "",
    manufactureYear: "",
    askingPriceUsd: "",
    desiredSaleDays: "",
    description: "",
    authenticityNotes: "",
    ownershipConfirmed: false
  };
}

function createSellerIntakeState(): AppState["sellerIntake"] {
  return {
    open: false,
    isSaving: false,
    error: "",
    draft: createEmptySellerDraft(),
    photo: null,
    mode: "ai",
    ai: {
      messages: [],
      draft: "",
      isThinking: false,
      error: "",
      missingFields: [...SELLER_REQUIRED_AI_FIELDS],
      confidence: 0,
      trace: null
    }
  };
}

function isSellerTextField(value: string): value is SellerTextField {
  return SELLER_TEXT_FIELDS.includes(value as SellerTextField);
}

function updateSellerTextField(field: SellerTextField, value: string): void {
  if (field === "targetMarket") {
    if (value === "Japan" || value === "United States" || value === "Germany") {
      state.sellerIntake.draft.targetMarket = value;
    }
    return;
  }

  if (field === "category") {
    if (["Handbag", "Watch", "Jewelry", "Accessories", "Other"].includes(value)) {
      state.sellerIntake.draft.category = value as SellerListing["category"];
    }
    return;
  }

  if (field === "condition") {
    if (["New or unworn", "Excellent", "Very good", "Good", "Fair"].includes(value)) {
      state.sellerIntake.draft.condition = value as SellerListing["condition"];
    }
    return;
  }

  state.sellerIntake.draft[field] = value;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function speechLanguageFor(customer: Customer): string {
  if (customer.language.toLowerCase().includes("japanese")) return "ja-JP";
  if (customer.language.toLowerCase().includes("german")) return "de-DE";
  return "en-US";
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read uploaded media."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not decode the product image."));
    image.src = dataUrl;
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function classToken(value: unknown): string {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function progressBand(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress / 5) * 5));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getInitialTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // Fall through to the system preference.
  }

  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
