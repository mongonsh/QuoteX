# Devpost submission draft

Replace every angle-bracket field with real evidence before publishing.

## Project name

QuoteX - The governed cross-border commerce agent

## Track

Track 4: Autopilot Agent

## Elevator pitch

QuoteX turns an unstructured product description or buyer message into a grounded, review-ready cross-border offer. Qwen3.7 chooses six typed commerce skills; deterministic tools protect catalog facts, freight, price, margin, and policy; persistent memory improves repeat decisions; and a human retains the final commercial approval.

## Inspiration

Cross-border sales work starts in messy channels: short emails, voice messages, product photos, vague references such as “the same controller,” uncertain quantities, delivery deadlines, and assumed payment terms. Before replying, a person must search customer history, identify the real product, check stock, protect margin, compare freight, and determine which promises need review.

That repetitive coordination is ideal for an agent. Letting a language model invent a SKU, calculate a price, or publish an offer is not. QuoteX explores a more useful form of autonomy: Qwen plans the work, verified tools own commercial truth, and one bounded human checkpoint controls the irreversible action.

The flagship demo follows a realistic Mongolian exporter responding to Nordlicht Concept Stores
in Berlin. One buyer message requests 500 Grade-A cashmere scarves across three colors, plastic-free
packaging, DDP delivery within 21 days, freight below USD 1,000, and origin documents. QuoteX
recalls the buyer's Net 30 terms and DHL Economy preference, verifies stock and margin, produces a
review-ready `$33,630` landed offer, and stops before sending it.

## What it does

QuoteX supports two connected workflows.

First, a seller can add any product through voice, text, or a manual form. Qwen fills an editable record and asks only for the highest-priority missing fact. The server validates the product, seller intent, ownership confirmation, and primary photo before Tablestore stores metadata and private OSS stores the image in cloud mode. The categories include electronics, fashion, home and garden, beauty, collectibles, sports, industrial goods, and resale items.

Second, a seller or export team can run an incoming buyer request. Qwen3.7 operates as a bounded function-calling planner and chooses six custom skills:

1. Structure the untrusted request.
2. Retrieve relevant, evidence-backed customer memory.
3. Match the request to a trusted catalog product.
4. Select a feasible shipping route.
5. Calculate a margin-safe landed offer.
6. Enforce risk policy and stop at human approval.

The output is not just a chat response. QuoteX shows the selected SKU, quote arithmetic, freight route, relevant memories, risk checks, skill source, planner turns, latency, token usage, approval state, and SHA-256 audit digest. The durable cloud path persists the last 200 runs in a Tablestore evidence ledger; the lightweight public judge deployment explicitly reports its non-durable memory adapter.

Once the offer exists, the same product record powers a campaign workflow. Qwen vision creates a grounded creative brief, Wan/Qwen Image produces a commercial edit, and HappyHorse animates the frame. Amazon, eBay, and Alibaba.com adapters create validation-first draft payloads with platform-specific title limits, condition mapping, required fields, and warnings. They deliberately do not publish until OAuth and human approval are implemented.

The second cashmere request asks for 800 units using the previous packaging, payment, and freight
decision. That replay makes persistent memory visible: five scoped facts alter the quote strategy,
while stale or unrelated facts remain excluded.

Customers can also ask questions by voice. Qwen ASR transcribes the complete recording, Qwen3.7 answers only from customer-safe offer context, and Qwen Voice Design plus Qwen3-TTS-VD speaks with a cached QuoteX voice. The assistant can explain product, delivery, and approval status, but cannot change terms, approve, publish, or place an order.

## How we built it

QuoteX is written in strict TypeScript with shared domain and API contracts. The browser provides an editable workbench; an Alibaba Function Compute backend owns credentials, input validation, and Qwen calls. The lightweight judge deployment uses an ACR-free custom-runtime ZIP; the production path adds durable Tablestore evidence, private OSS media, SLS-ready structured logs, and an immutable ACR container.

The main engineering challenge was separating probabilistic planning from commercial authority. `server/qwen-tool-orchestrator.ts` gives Qwen strict JSON schemas for only the skills still missing and caps the loop at four planner turns. Qwen may select tools and propose bounded arguments, but `src/rfq-engine.ts` computes every trusted result.

The catalog matcher combines aliases, token overlap, explicit product intent, and phrase polarity. Negated and conditional alternatives receive penalties, so a request for “the controller, not the power brick, unless the driver is required” does not select the repeatedly mentioned driver. Unknown products become `CUSTOM-REVIEW` instead of a hallucinated SKU.

Memory is relevance-ranked, customer-scoped, versioned, capped, expiring, and written only after human approval. Shipping uses destination, deadline, cost, reliability, freight ceiling, and remembered preferences. Pricing uses catalog cost, quantity, freight, discount rules, and a deterministic margin floor. Policy checks ambiguity, inventory, margin, provenance, payment, and delivery before forcing `human-review-required`.

The run ledger retains the last 200 sanitized executions with model, status, planner turns, skill coverage, latency, gate, and a SHA-256 evidence digest. Missing keys, timeouts, quotas, malformed output, and omitted tools complete through the same trusted core and are labeled `guarded-fallback`; QuoteX never presents deterministic recovery as live Qwen success.

We also built a same-model adversarial evaluator instead of relying on architecture claims. Across prompt injection, negated alternatives, inventory shortfall, unknown products, tight deadlines, and memory replay, the live governed Qwen tool agent passed 42/42 checks. Qwen3.7 producing the final decision in one prompt passed 28/42 with the same trusted context and rules, a 33.3 percentage-point difference. The evaluator found and drove fixes for comma-separated quantities, model-expanded memory relevance, and carrier-level preference matching.

## How we use Qwen Cloud

- Qwen3.7 function calling for bounded planning across six custom commerce skills.
- Qwen3.7 structured conversation for AI-assisted product intake.
- Qwen3-ASR-Flash for complete browser-recorded voice transcription.
- Qwen3.7 customer support grounded in privacy-filtered offer context.
- Qwen Voice Design and matching Qwen3-TTS-VD for a reusable, human-sounding QuoteX voice.
- Qwen3.7 vision for product-photo understanding and campaign brief generation.
- Wan/Qwen Image routing for photo-grounded commercial imagery.
- HappyHorse image-to-video tasks with real submission, polling, and provider provenance.
- OpenAI-compatible request metadata for model, host, latency, usage, and tool-call evidence.

## Innovation

Most agent demos hide reasoning inside a transcript. QuoteX makes agency inspectable. Every skill says whether Qwen chose it or a guardrail completed it, and every result identifies the trusted code boundary that produced it. The interface visualizes a useful compromise between autonomy and control: broad freedom to plan, narrow authority over facts, and no authority over irreversible actions.

The product also connects normally separate workflows. One verified product and one governed offer can become persistent memory, a customer voice answer, an AI campaign asset, a product video, and three marketplace-ready drafts without copying facts between tools.

The evaluation is part of the innovation: it scores trusted SKU, quantity, price authority, freight, arithmetic, risks, and the human gate against a direct Qwen baseline. That makes the safety argument falsifiable and repeatable rather than a diagram-only claim.

## Challenges

Function calling is not automatically reliable. A model may call tools in phases, omit one, send malformed arguments, or return prose early. We built a missing-skill repair loop with a four-turn ceiling and deterministic completion for anything still absent.

We also found that naive keyword matching fails when requests contain negation or conditional alternatives. The phrase-polarity matcher and regression fixtures were added after a real benchmark exposed that weakness.

The first adversarial run exposed two subtler failures. `1,500` was parsed as `1`, and Qwen's proposed memory-search text could broaden relevance enough to alter a discount. We fixed grouped-number parsing, bound memory relevance to the original request, required evidence overlap for preference boosts, and added regression tests for both.

Multimodal APIs have different endpoints, regional credentials, latency, expiration behavior, and asynchronous task models. QuoteX keeps those adapters separate, immediately persists expiring image/audio assets, and exposes provider status instead of hiding it.

Qwen's streamed WAV responses can use sentinel RIFF and data lengths intended for streaming. Some decoders tolerate them, while browsers may reject them. QuoteX detects the WAV signature, rewrites both lengths to the actual byte count, caps persisted audio at 10 MB, and regression-tests the real `audio/x-wav` variant. Signed audio downloads use bounded retry only for transient network, timeout, rate-limit, and 5xx failures; permanent errors remain visible.

## Accomplishments

- Six real Qwen-selected function tools with strict schemas and bounded repair.
- Deterministic catalog, memory, freight, pricing, risk, and approval logic.
- Prompt-injection resistance: buyer text cannot set a one-dollar price or bypass approval.
- Durable Tablestore product metadata and 200-run evidence ledger plus private OSS media.
- Conversational product intake across general merchandise categories.
- Qwen ASR, customer agent, designed voice, TTS, vision, image editing, and HappyHorse video in one governed workflow.
- Browser-safe Qwen voice playback with normalized streaming WAV headers and bounded signed-asset retry.
- Validation-first Amazon, eBay, and Alibaba.com adapters with honest publishing boundaries.
- Visible live-versus-recovery provenance and no fake AI success.
- A 100-run checked-in regression baseline with 100% product selection, quote arithmetic, approval-gate enforcement, and no-model fallback completion on the declared fixtures.
- A live same-model adversarial result of 42/42 for governed Qwen tools versus 28/42 for direct single-prompt Qwen, with protocol and limitations checked in.
- Strict typing, automated failure tests, security headers, health checks, Docker packaging, and Function Compute deployment instructions.
- Idempotent Alibaba provisioning for Tablestore, private OSS, SLS, and a least-privilege RAM execution role.
- Secret-safe AMD64 image publication to ACR with immutable digest capture.
- Idempotent FC3 function and HTTP-trigger deployment with readiness polling and a private demo-link gate.
- A live Japan-region Function Compute deployment with a public health endpoint, protected AI routes, and a verified end-to-end `qwen3.7-plus` request.

## Impact and product path

QuoteX can serve export sales teams, marketplace sellers, manufacturers, distributors, and resale businesses. Its typed boundaries make the demo replaceable with real tenant services: CRM and ERP data, catalog search, freight providers, managed persistence, object storage, signed approvals, and authenticated marketplace publishing.

The current benchmark is an engineering regression suite, not a human productivity study. A production pilot would measure time to reviewed quote, correction rate, margin leakage, approval overrides, conversion, and repeat-customer response consistency.

## What we learned

Production autonomy is not the absence of humans. It is the removal of repetitive work before the smallest meaningful human decision. We also learned that reliability earns trust only when recovery is visible and that agent evidence is part of the product, not debugging decoration.

## What's next

- Upgrade the lightweight public Function Compute route from memory storage to the checked-in Tablestore, private OSS, SLS, and RAM production path.
- Add tenant identity, role-based approval limits, signed events, rate limits, and idempotency.
- Connect CRM, ERP, catalog, and freight services through authenticated MCP tools using the existing typed contracts.
- Add OAuth-backed Amazon, eBay, and Alibaba.com publishing after the existing validation and approval gates.
- Export operational metrics to Simple Log Service and run a real seller pilot.

## Built with

Qwen Cloud, Qwen3.7-Plus, Qwen3-ASR-Flash, Qwen Voice Design, Qwen3-TTS-VD, Wan Image, Qwen Image, HappyHorse, Alibaba Cloud Function Compute, Tablestore, OSS, SLS, RAM, Container Registry, TypeScript, Node.js, SQLite, HTML, CSS, and Docker/Podman.

## Alibaba Cloud deployment proof

Devpost requests a direct link to a code file demonstrating Alibaba Cloud services and APIs. QuoteX's required proof is the executable FC3 deployment module:

`https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts`

It uses the official `@alicloud/fc20230330` SDK to create or update either a code-package or Custom Container function and its HTTP trigger. The adjacent infrastructure module provisions Tablestore, private OSS, SLS, and a least-privilege RAM execution role. The live Qwen orchestration module calls the Qwen Cloud workspace endpoint with six typed commerce tools. Dry-run plans are not described as live Function Compute runtime evidence.

The code-package path is deployed in Japan (Tokyo). The browser UI is served from GitHub Pages because Alibaba's generated Function Compute domain forces `Content-Disposition: attachment`; every protected API and Qwen call still runs on the Alibaba backend through a strict CORS allowlist. The public health endpoint identifies Function Compute, confirms the Qwen services are configured, and honestly reports memory storage as non-durable. A protected browser smoke test reached `qwen3.7-plus`, completed six of six commerce skills, and returned live provider provenance. Sanitized evidence binds the Function Compute endpoint and ZIP digest to backend source commit `3c80dab`.

## Links

- Live browser application: `https://mongonsh.github.io/QuoteX/`
- Alibaba Function Compute API: `https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run`
- Live health check: `https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run/api/health`
- Source code: `https://github.com/mongonsh/QuoteX`
- Demo video: `<DEMO_VIDEO_URL>` (upload-ready local artifact: `.runtime/demo/QuoteX-motion-demo.mp4`)
- Required Alibaba Cloud deployment code proof: `https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts`
- Sanitized runtime evidence: `https://github.com/mongonsh/QuoteX/blob/main/docs/alibaba-deployment-evidence.json`
- Live Qwen Cloud runtime integration: `https://github.com/mongonsh/QuoteX/blob/main/server/qwen-tool-orchestrator.ts`
- Governed-agent evaluation: `https://github.com/mongonsh/QuoteX/blob/main/docs/EVALUATION.md`
