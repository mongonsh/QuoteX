# Devpost submission draft

Replace every angle-bracket field with real evidence before publishing.

## Project name

QuoteX — The governed RFQ autopilot

## Elevator pitch

QuoteX turns ambiguous multilingual buyer messages into evidence-backed cross-border quotes using Qwen Cloud, deterministic business tools, persistent customer memory, and a mandatory human approval gate.

## Inspiration

Export sales teams rarely receive structured order forms. They receive short emails in different languages, references such as “the same board,” uncertain product descriptions, delivery deadlines, freight ceilings, and assumed payment terms. Preparing a safe quote requires searching customer history, matching a catalog, checking stock, protecting margin, comparing freight, and deciding what needs a human. The repetitive work is ideal for an agent, but sending a commercial offer without control is not.

## What it does

QuoteX runs an RFQ through five governed stages:

1. Qwen extracts structured intent from multilingual text.
2. A memory tool recalls account preferences and prior approved outcomes.
3. Catalog and inventory tools map vague language to a real SKU.
4. Pricing and freight tools calculate a margin-safe landed offer.
5. Policy checks surface risk and stop at a human approval checkpoint.

After approval, QuoteX stores the outcome for later RFQs. The demo includes a second Mori Lighting message that refers to “the previously approved terms,” proving that learned memory is recalled on the next run. A Creative workspace also uses Qwen for the campaign brief and Qwen-Image Edit to transform an uploaded product photo.

## How we built it

The frontend and Node HTTP service are written in strict TypeScript with shared domain and API contracts. The browser receives standards-based compiled ES modules. The server keeps credentials private and proxies Qwen Cloud's OpenAI-compatible chat-completions endpoint. Qwen output is normalized before entering deterministic tools for catalog scoring, memory relevance, freight selection, pricing, and risk policy.

Each timeline stage declares its execution boundary: Qwen Cloud, verified deterministic tool, resilient fallback, memory write, or human gate. The Qwen Trace exposes model ID, safe endpoint host, latency, token usage, sanitized prompt, and structured response. If Qwen is unavailable, QuoteX visibly switches to a deterministic parser; it never presents a fallback result as a live model call.

Approved outcomes use a versioned cross-session store with per-customer bounds, expiry, deduplication, and a user clear control. The production container listens on `0.0.0.0:9000` and is prepared for Alibaba Cloud Function Compute.

## How we use Qwen Cloud

- Qwen multilingual RFQ extraction and ambiguity flags.
- Qwen customer/catalog context grounding.
- Qwen B2B creative brief generation.
- Qwen-Image Edit for product campaign imagery.
- Live trace evidence for model, host, latency, tokens, prompt, and response.
- Graceful, explicitly labeled fallback when a Qwen service is unavailable.

## Challenges

The hardest design decision was separating language reasoning from commercial authority. Using an LLM for every step would look agentic but make price, margin, stock, and policy hard to reproduce. QuoteX instead uses Qwen where ambiguity matters and deterministic tools where correctness matters. Another challenge was keeping the live demo reliable without faking model success, which led to the explicit dual-mode design and traceable fallback.

## Accomplishments

- Processes Japanese, German, and English RFQs.
- Turns vague product references into ranked catalog matches.
- Quantifies memory effects on pricing and routing confidence.
- Persists only human-approved outcomes across sessions.
- Escalates product ambiguity, stock shortfall, margin risk, new-buyer terms, and tight deadlines.
- Prevents autonomous commercial sending by design.
- Generates multimodal campaign assets with Qwen-Image Edit.
- Includes automated tests, threat model, failure matrix, Docker deployment, health check, and a three-minute judge script.

## What we learned

Production autopilot is not maximum autonomy. It is the smallest human checkpoint placed after the agent has assembled enough evidence for a fast, accountable decision. We also learned that fallbacks must be visible: reliability improves trust only when the interface is honest about which model and tools actually ran.

## What's next

- Move the demo memory contract to Alibaba Cloud Tablestore.
- Expose CRM, ERP, catalog, and freight providers as authenticated MCP tools.
- Sign approval events and generated quote artifacts.
- Export traces to Simple Log Service for latency, fallback, override, and risk dashboards.
- Add tenant authentication, role-based approval limits, idempotency, and rate limiting.

## Built with

Qwen Cloud, Qwen-Image Edit, Alibaba Cloud Function Compute, Alibaba Cloud Container Registry, TypeScript, Node.js, HTML, CSS, Docker

## Links

- Live application: `<FUNCTION_COMPUTE_URL>`
- Source code: `<PUBLIC_GITHUB_URL>`
- Demo video: `<DEMO_VIDEO_URL>`
- Alibaba Cloud deployment proof: `<DEPLOYMENT_PROOF_URL>`
- Technical blog post: `<BLOG_POST_URL>`
