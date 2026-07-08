import { customers, products, rfqScenarios } from "./data.js";
import { approveQuote, formatUsd, runAutopilot } from "./rfq-engine.js";

const app = document.querySelector("[data-app-shell]");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;

const state = {
  selectedRfqId: rfqScenarios[0].id,
  rfqDrafts: {},
  analysis: null,
  visibleStageCount: 0,
  isRunning: false,
  voice: {
    isListening: false,
    status: SpeechRecognition ? "Ready" : "Not supported",
    error: ""
  },
  productMedia: null,
  marketingAsset: null,
  marketingTrace: null,
  creativeError: "",
  isGeneratingCreative: false,
  approvedAnalyses: [],
  selectedView: "workbench"
};
let activeRecognition = null;

render();

app.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;

  const { action: actionName } = action.dataset;

  if (actionName === "select-rfq") {
    stopVoiceInput();
    state.selectedRfqId = action.dataset.rfqId;
    state.analysis = null;
    state.marketingAsset = null;
    state.marketingTrace = null;
    state.creativeError = "";
    state.visibleStageCount = 0;
    state.isRunning = false;
    render();
  }

  if (actionName === "run-autopilot") {
    await runSelectedRfq();
  }

  if (actionName === "approve-quote" && state.analysis) {
    state.analysis = approveQuote(state.analysis);
    state.approvedAnalyses = [state.analysis, ...state.approvedAnalyses].slice(0, 4);
    state.visibleStageCount = state.analysis.timeline.length;
    render();
  }

  if (actionName === "set-view") {
    state.selectedView = action.dataset.view;
    render();
  }

  if (actionName === "toggle-voice") {
    if (state.voice.isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  }

  if (actionName === "reset-rfq") {
    stopVoiceInput();
    delete state.rfqDrafts[state.selectedRfqId];
    state.analysis = null;
    state.marketingAsset = null;
    state.marketingTrace = null;
    state.creativeError = "";
    render();
  }

  if (actionName === "clear-media") {
    state.productMedia = null;
    state.marketingAsset = null;
    state.marketingTrace = null;
    state.creativeError = "";
    render();
  }

  if (actionName === "generate-creative") {
    await generateMarketingCreative();
  }
});

app.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;

  if (field.dataset.field === "rfq-message") {
    state.rfqDrafts[state.selectedRfqId] = field.value;
    state.analysis = null;
    state.marketingAsset = null;
    state.marketingTrace = null;
    state.creativeError = "";
  }
});

app.addEventListener("change", async (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;

  if (field.dataset.field === "product-media") {
    await handleMediaUpload(field.files?.[0]);
  }
});

async function runSelectedRfq() {
  state.isRunning = true;
  state.analysis = null;
  state.marketingAsset = null;
  state.marketingTrace = null;
  state.creativeError = "";
  state.visibleStageCount = 0;
  render();

  const rfq = getSelectedRfq();
  state.analysis = await runAutopilot(rfq);

  for (let index = 1; index <= state.analysis.timeline.length; index += 1) {
    state.visibleStageCount = index;
    render();
    await wait(260);
  }

  state.isRunning = false;
  render();
}

async function generateMarketingCreative() {
  if (!state.productMedia || state.isGeneratingCreative) return;

  if (!state.analysis) {
    state.creativeError = "Run the autopilot first so the creative uses the current product and quote.";
    render();
    return;
  }

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
    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `Creative service returned ${response.status}`);
    }

    state.marketingAsset = payload.asset;
    state.marketingTrace = payload.trace;
  } catch (error) {
    state.creativeError = error.message;
    state.marketingTrace = {
      status: "error",
      error: error.message
    };
  } finally {
    state.isGeneratingCreative = false;
    render();
  }
}

async function handleMediaUpload(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    state.creativeError = "Please upload a product image.";
    render();
    return;
  }

  if (file.size > 5_000_000) {
    state.creativeError = "Please upload an image under 5 MB.";
    render();
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  state.productMedia = {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    dataUrl
  };
  state.marketingAsset = null;
  state.marketingTrace = null;
  state.creativeError = "";
  render();
}

function startVoiceInput() {
  if (!SpeechRecognition) {
    state.voice.status = "Not supported";
    state.voice.error = "Use Chrome or Edge for browser speech input.";
    render();
    return;
  }

  stopVoiceInput();
  const rfq = getSelectedRfq();
  const customer = getCustomer(rfq.customerId);
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = speechLanguageFor(customer);

  recognition.onstart = () => {
    state.voice.isListening = true;
    state.voice.status = "Listening";
    state.voice.error = "";
    render();
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .slice(event.resultIndex)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();

    if (transcript) {
      appendTranscript(transcript);
    }
  };

  recognition.onerror = (event) => {
    state.voice.error = event.error === "not-allowed" ? "Microphone permission is blocked." : event.error;
    state.voice.status = "Stopped";
    state.voice.isListening = false;
    render();
  };

  recognition.onend = () => {
    if (activeRecognition === recognition) {
      activeRecognition = null;
    }

    state.voice.isListening = false;
    state.voice.status = "Ready";
    render();
  };

  recognition.start();
}

function stopVoiceInput() {
  if (activeRecognition) {
    activeRecognition.stop();
    activeRecognition = null;
  }

  state.voice.isListening = false;
}

function appendTranscript(transcript) {
  const current = getRfqDraft(getSelectedRfqBase()).trim();
  const next = current ? `${current} ${transcript}` : transcript;
  state.rfqDrafts[state.selectedRfqId] = next;
  state.analysis = null;
  state.marketingAsset = null;
  state.marketingTrace = null;
  render();
}

function render() {
  const selectedRfq = getSelectedRfq();
  const customer = getCustomer(selectedRfq.customerId);
  const qwenStatus = state.analysis?.qwenTrace?.status || "ready";
  const progress = state.analysis
    ? Math.round((state.visibleStageCount / state.analysis.timeline.length) * 100)
    : 0;

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="./" aria-label="QuotePilot home">
        <img src="./assets/quotepilot-mark.svg" alt="" width="36" height="36" />
        <span>
          <strong>QuotePilot</strong>
          <small>Qwen RFQ Autopilot</small>
        </span>
      </a>
      <div class="topbar__metrics" aria-label="Demo metrics">
        ${metric("RFQ time", "28 min -> 90 sec")}
        ${metric("Approval gate", "Always on")}
        ${metric("Qwen parser", qwenStatus)}
      </div>
    </header>

    <main class="shell">
      <aside class="inbox-panel panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">RFQ Inbox</p>
            <h1>Cross-border quote desk</h1>
          </div>
          <span class="status-pill">${rfqScenarios.length} live</span>
        </div>
        <div class="rfq-list">
          ${rfqScenarios.map(renderRfqListItem).join("")}
        </div>
      </aside>

      <section class="workbench">
        <div class="control-panel panel">
          <div class="rfq-copy">
            <div class="rfq-copy__title">
              <span class="language-chip">${escapeHtml(customer.market)}</span>
              <h2>${escapeHtml(selectedRfq.subject)}</h2>
            </div>
            <div class="rfq-input-toolbar">
              <label for="rfq-message">Buyer RFQ input</label>
              <div class="rfq-input-toolbar__actions">
                <button class="icon-button ${state.voice.isListening ? "is-active" : ""}" data-action="toggle-voice" title="Voice to text" aria-label="Voice to text">
                  ${icon("mic")}
                </button>
                <button class="secondary-button" data-action="reset-rfq">
                  ${icon("reset")}
                  <span>Reset</span>
                </button>
              </div>
            </div>
            <textarea id="rfq-message" class="rfq-input" data-field="rfq-message" rows="5">${escapeHtml(
              selectedRfq.rawMessage
            )}</textarea>
            <div class="input-status">
              <span>${state.voice.isListening ? "Listening" : state.voice.status}</span>
              ${state.voice.error ? `<strong>${escapeHtml(state.voice.error)}</strong>` : ""}
            </div>
          </div>
          <div class="control-panel__actions">
            <button class="primary-button" data-action="run-autopilot" ${state.isRunning ? "disabled" : ""}>
              ${icon("play")}
              <span>${state.isRunning ? "Running" : "Run Autopilot"}</span>
            </button>
            <div class="progress-ring" style="--progress:${progress}%">
              <span>${progress}%</span>
            </div>
          </div>
        </div>

        <div class="view-tabs" role="tablist" aria-label="Workspace views">
          ${tab("workbench", "Workbench")}
          ${tab("memory", "Memory")}
          ${tab("quote", "Quote")}
          ${tab("creative", "Creative")}
          ${tab("trace", "Qwen Trace")}
        </div>

        <div class="workspace-grid workspace-grid--${state.selectedView}">
          ${renderActiveView(customer)}
        </div>
      </section>
    </main>
  `;
}

function renderActiveView(customer) {
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
    `;
  }

  if (state.selectedView === "trace") {
    return `
      ${renderTracePanel()}
      ${renderTraceSummaryPanel()}
    `;
  }

  return `
    ${renderTimelinePanel()}
    ${renderDecisionPanel(customer)}
  `;
}

function renderTracePanel() {
  const trace = state.analysis?.qwenTrace;

  if (!trace) {
    return panelPlaceholder("Qwen Trace", "No model call yet");
  }

  const response = trace.response || { status: trace.status, error: trace.error || trace.reason };

  return `
    <section class="panel trace-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Qwen Cloud</p>
          <h2>Parser trace</h2>
        </div>
        <span class="status-pill status-pill--${trace.status === "live" ? "success" : "warning"}">
          ${escapeHtml(trace.status)}
        </span>
      </div>
      <div class="trace-grid">
        ${traceFact("Model", trace.model || "qwen3.6-flash")}
        ${traceFact("Endpoint", trace.endpointHost || "local fallback")}
        ${traceFact("Latency", trace.elapsedMs ? `${trace.elapsedMs} ms` : "n/a")}
        ${traceFact("Tokens", trace.usage ? String(trace.usage.total_tokens) : "n/a")}
      </div>
      <pre class="trace-code">${escapeHtml(JSON.stringify(response, null, 2))}</pre>
    </section>
  `;
}

function renderTraceSummaryPanel() {
  const trace = state.analysis?.qwenTrace;
  const prompt = trace?.prompt;

  return `
    <section class="panel trace-prompt-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Prompt Payload</p>
          <h2>${prompt ? "Sanitized request" : "No payload captured"}</h2>
        </div>
      </div>
      ${
        prompt
          ? `<pre class="trace-code trace-code--prompt">${escapeHtml(prompt)}</pre>`
          : renderEmptyState("No Qwen prompt", trace?.error || trace?.reason || "Awaiting parser run.")
      }
    </section>
  `;
}

function renderRfqListItem(rfq) {
  const customer = getCustomer(rfq.customerId);
  const isSelected = rfq.id === state.selectedRfqId;

  return `
    <button class="rfq-item ${isSelected ? "is-selected" : ""}" data-action="select-rfq" data-rfq-id="${rfq.id}">
      <span class="rfq-item__main">
        <strong>${escapeHtml(customer.company)}</strong>
        <small>${escapeHtml(rfq.subject)}</small>
      </span>
      <span class="priority priority--${rfq.priority.toLowerCase()}">${escapeHtml(rfq.priority)}</span>
    </button>
  `;
}

function renderTimelinePanel() {
  const timeline = state.analysis
    ? state.analysis.timeline.slice(0, state.visibleStageCount)
    : [];

  return `
    <section class="panel agent-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Agent Society</p>
          <h2>Autopilot timeline</h2>
        </div>
        <span class="status-pill">${state.isRunning ? "Processing" : timeline.length ? "Ready" : "Idle"}</span>
      </div>
      <div class="timeline">
        ${
          timeline.length
            ? timeline.map(renderTimelineStep).join("")
            : renderEmptyState("No analysis yet", "Agent workbench is idle.")
        }
      </div>
    </section>
  `;
}

function renderTimelineStep(step) {
  return `
    <article class="timeline-step">
      <div class="timeline-step__rail">
        <span>${icon("node")}</span>
      </div>
      <div class="timeline-step__body">
        <div class="timeline-step__topline">
          <strong>${escapeHtml(step.role)}</strong>
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

function renderDecisionPanel(customer) {
  if (!state.analysis) {
    return `
      <section class="panel decision-panel">
        <div class="panel__header">
          <div>
            <p class="eyebrow">Human Gate</p>
            <h2>Approval checkpoint</h2>
          </div>
        </div>
        ${renderRouteAsset(customer)}
      </section>
    `;
  }

  const { analysis } = state;
  const approved = analysis.approval.status === "approved";

  return `
    <section class="panel decision-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Human Gate</p>
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
        <span>${approved ? "Quote approved" : "Approve quote"}</span>
      </button>
      ${renderRouteAsset(customer)}
    </section>
  `;
}

function renderRisk(risk) {
  return `
    <div class="risk risk--${risk.level}">
      <strong>${escapeHtml(risk.title)}</strong>
      <span>${escapeHtml(risk.detail)}</span>
    </div>
  `;
}

function renderQuotePanel() {
  if (!state.analysis) {
    return panelPlaceholder("Quote", "No quote generated");
  }

  const { quote, shipping } = state.analysis;

  return `
    <section class="panel quote-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Commercial Offer</p>
          <h2>${escapeHtml(quote.sku)}</h2>
        </div>
        <span class="status-pill">${Math.round(quote.margin * 100)}% margin</span>
      </div>
      <dl class="quote-table">
        ${quoteLine("Product", quote.productName)}
        ${quoteLine("Quantity", quote.quantity.toLocaleString("en-US"))}
        ${quoteLine("Unit price", formatUsd(quote.unitPrice))}
        ${quoteLine("Goods total", formatUsd(quote.goodsTotal))}
        ${quoteLine("Freight", `${shipping.carrier}, ${shipping.days} days`)}
        ${quoteLine("Payment", quote.paymentTerms)}
        ${quoteLine("Landed total", formatUsd(quote.landedTotal), true)}
      </dl>
    </section>
  `;
}

function renderDraftPanel() {
  if (!state.analysis) {
    return panelPlaceholder("Draft", "No message drafted");
  }

  return `
    <section class="panel draft-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Outbound Draft</p>
          <h2>Buyer reply</h2>
        </div>
      </div>
      <pre>${escapeHtml(state.analysis.draftEmail)}</pre>
    </section>
  `;
}

function renderMediaPanel() {
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
          ${media ? renderMediaPreview(media) : renderEmptyState("Upload product media", "PNG, JPG, WEBP, AVIF, or GIF under 5 MB.")}
          <input id="product-media" data-field="product-media" type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" />
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

function renderCreativePanel() {
  const asset = state.marketingAsset;
  const trace = state.marketingTrace;
  const canGenerate = Boolean(state.productMedia && state.analysis) && !state.isGeneratingCreative;

  return `
    <section class="panel creative-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">AI Marketing Studio</p>
          <h2>Quote campaign image</h2>
        </div>
        <span class="status-pill status-pill--${trace?.status?.startsWith("live") ? "success" : "warning"}">
          ${trace?.status || "Idle"}
        </span>
      </div>
      <div class="creative-body">
        ${
          asset
            ? `<img class="creative-image" src="${escapeHtml(asset.imageDataUrl)}" alt="Generated marketing asset" />`
            : renderEmptyState("No creative yet", "Run autopilot, upload media, then generate an asset.")
        }
        <div class="creative-actions">
          <button class="primary-button" data-action="generate-creative" ${canGenerate ? "" : "disabled"}>
            ${icon("spark")}
            <span>${state.isGeneratingCreative ? "Generating" : "Generate creative"}</span>
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

function renderMediaPreview(media) {
  return `
    <div class="media-preview">
      <img src="${escapeHtml(media.dataUrl)}" alt="Uploaded product" />
      <span>${icon("upload")}</span>
    </div>
  `;
}

function renderCreativeBrief(brief, trace) {
  const notes = brief.complianceNotes || [];

  return `
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
        <span>Model</span>
        <strong>${escapeHtml(trace?.model || "qwen3.6-flash")}</strong>
      </div>
      <p>${escapeHtml(brief.visualPrompt)}</p>
      ${notes.length ? `<p>${escapeHtml(notes.join(" "))}</p>` : ""}
    </div>
  `;
}

function traceFact(label, value) {
  return `
    <div class="trace-fact">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderMemoryPanel(customer) {
  const memoryWrite = state.analysis?.memoryWrite;
  const memories = memoryWrite ? [memoryWrite, ...customer.memory] : customer.memory;

  return `
    <section class="panel memory-panel">
      <div class="panel__header">
        <div>
          <p class="eyebrow">Persistent Memory</p>
          <h2>${escapeHtml(customer.company)}</h2>
        </div>
        <span class="status-pill">${memories.length} facts</span>
      </div>
      <div class="memory-list">
        ${memories.map(renderMemory).join("")}
      </div>
    </section>
  `;
}

function renderLearningPanel() {
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

function renderMemory(memory) {
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

function renderOutcome(analysis) {
  return `
    <article class="outcome-item">
      <strong>${escapeHtml(analysis.customer.company)}</strong>
      <span>${escapeHtml(analysis.quote.sku)} approved at ${formatUsd(analysis.quote.landedTotal)}</span>
    </article>
  `;
}

function renderRouteAsset(customer) {
  const market = customer.market;
  const destination = market === "Japan" ? "Yokohama" : market === "Germany" ? "Hamburg" : "Los Angeles";

  return `
    <div class="route-asset" aria-label="Shipment route visualization">
      <div class="route-asset__port route-asset__port--origin">
        <strong>Shenzhen</strong>
        <span>Warehouse</span>
      </div>
      <div class="route-asset__line">
        <span></span>
      </div>
      <div class="route-asset__port route-asset__port--destination">
        <strong>${destination}</strong>
        <span>${escapeHtml(customer.market)}</span>
      </div>
    </div>
  `;
}

function panelPlaceholder(title, text) {
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

function renderEmptyState(title, text) {
  return `
    <div class="empty-state">
      ${icon("empty")}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

function metric(label, value) {
  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function tab(view, label) {
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

function quoteLine(label, value, isTotal = false) {
  return `
    <div class="${isTotal ? "is-total" : ""}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function icon(name) {
  const icons = {
    play:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L21 7.6l-1.4-1.4z"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9l3.3-3.3 1.4 1.4L12 15.8l-5.7-5.7 1.4-1.4L11 12V3Zm-6 14h2v2h10v-2h2v4H5v-4Z"/></svg>',
    mic:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Zm-2 4a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0V7Zm-5 4h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11Z"/></svg>',
    node:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-4.8 6.4l-3.5 2A4 4 0 1 0 5 17.9l3.7-2.1a5 5 0 0 0 6.6 0l3.7 2.1a4 4 0 1 0 1.3-7.5l-3.5-2A5 5 0 0 0 12 2Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM4 12a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm16 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm-8 1a5 5 0 0 0 1.7-.3l3.5 2-2.9 1.7a5 5 0 0 0-4.6 0l-2.9-1.7 3.5-2A5 5 0 0 0 12 13Z"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 4H3.6A9 9 0 1 0 6 5.7V3H4v6h6V7H7.5A7 7 0 0 1 12 5Z"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Zm6 11 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 12H7.7L7 9Zm3 2 .3 8h1.8l-.3-8H10Zm3.8 0-.3 8h1.8l.3-8h-1.8Z"/></svg>',
    upload:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h2V8.8l3.3 3.3 1.4-1.4L12 5l-5.7 5.7 1.4 1.4L11 8.8V17Zm-6 2h14v2H5v-2Z"/></svg>',
    empty:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 2h8v2H8V9Zm0 4h5v2H8v-2Z"/></svg>'
  };

  return icons[name] || "";
}

function getSelectedRfq() {
  const rfq = getSelectedRfqBase();
  const rawMessage = getRfqDraft(rfq);

  return {
    ...rfq,
    rawMessage,
    isCustomDraft: rawMessage.trim() !== rfq.rawMessage.trim()
  };
}

function getSelectedRfqBase() {
  return rfqScenarios.find((rfq) => rfq.id === state.selectedRfqId) || rfqScenarios[0];
}

function getRfqDraft(rfq) {
  return state.rfqDrafts[rfq.id] ?? rfq.rawMessage;
}

function getCustomer(customerId) {
  return customers.find((customer) => customer.id === customerId) || customers[0];
}

function speechLanguageFor(customer) {
  if (customer.market === "Japan") return "ja-JP";
  if (customer.market === "Germany") return "de-DE";
  return "en-US";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read uploaded media."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
