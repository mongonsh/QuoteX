---
title: I Gave Qwen Six Tools, but Not the Right to Set a Price
published: false
description: How QuoteX turns messy buyer messages into auditable cross-border offers with Qwen Cloud, verified tools, memory, and one human gate.
tags: ai, qwen, agents, alibabacloud
cover_image: https://raw.githubusercontent.com/mongonsh/QuoteX/main/docs/screenshots/quotex-workbench.png
---

A buyer sends one message:

> Please quote 500 Grade-A Mongolian cashmere scarves for our Berlin stores. We need three colors, plastic-free packaging, DDP delivery within 21 days, freight below USD 1,000, and our usual payment terms.

It looks like a writing task. It is actually a chain of commercial decisions.

Which product did the buyer mean? Is it in stock? What were the buyer's "usual" terms? Which route can meet the deadline? Does the final price protect margin? Can the system send the offer?

The dangerous part is not understanding the sentence. The dangerous part is turning uncertain language into a promise involving inventory, money, and delivery.

That is why I built **QuoteX**, a governed cross-border commerce agent for the Qwen Cloud Autopilot Agent track.

Its core rule fits in one line:

> **Qwen plans. Verified tools decide facts. A human approves the promise.**

## Watch the demo

{% youtube AqyQlGGp_O8 %}

The demo follows a real-world export scenario from Ulaanbaatar to Berlin. One buyer message becomes a grounded `$33,630` landed offer, a customer-safe voice answer, and a campaign asset. The system still stops before sending anything.

## The request is not a form

Traditional sales software begins by asking a person to fill ten fields. Real buyers do not behave like database rows. They send emails, voice messages, photos, partial specifications, and phrases such as "same as last time."

QuoteX starts where the seller already is:

- paste a buyer message;
- speak the request;
- upload a product photo;
- or describe a new item conversationally.

Qwen structures the language, but the extracted fields remain editable. If an important fact is missing, the agent asks for that fact instead of quietly inventing it.

## Six tools, three kinds of authority

QuoteX gives `qwen3.7-plus` six strict function tools:

1. `structure_request`
2. `retrieve_customer_memory`
3. `match_product_catalog`
4. `select_shipping_route`
5. `calculate_margin_safe_quote`
6. `enforce_approval_policy`

The agent runs in a bounded loop with a maximum of four planner turns. On each turn, the server exposes only the skills that are still incomplete. Independent calls may run together, but every result returns through a typed, trusted boundary.

The important distinction is **tool selection versus commercial authority**:

| Qwen may                         | Qwen may not                         |
| -------------------------------- | ------------------------------------ |
| Understand the buyer's intent    | Invent a SKU or stock count          |
| Ask for relevant customer memory | Declare an unrelated memory relevant |
| Request a route comparison       | Invent a carrier price               |
| Request a quote calculation      | Set the resulting price or margin    |
| Explain risks to the seller      | Approve or send the offer            |

The orchestration loop is deliberately small. This excerpt is simplified from the [real implementation](https://github.com/mongonsh/QuoteX/blob/main/server/qwen-tool-orchestrator.ts):

```ts
const MAX_PLANNER_TURNS = 4;

for (const call of qwenToolCalls) {
  const verifiedResult = await executeTrustedSkill(call);
  messages.push(asToolEvidence(call.id, verifiedResult));
}

for (const skill of missingSkills(state)) {
  await executeSkill(state, skill, {}, `guardrail-${skill}`, "guardrail");
}

return {
  decision: materializeDecision(state),
  approvalGate: "human-review-required",
};
```

If Qwen omits a tool, returns malformed arguments, times out, or becomes unavailable, QuoteX completes the missing step through the same deterministic domain code. It labels that run `guarded-fallback`; it never presents recovery as live model reasoning.

## What the deterministic layer protects

The TypeScript domain layer owns the facts that can cost a business money:

- **Catalog matching** combines aliases, product terms, explicit intent, and phrase polarity.
- **Memory retrieval** is customer-scoped, relevance-ranked, expiring, and tied to the original request.
- **Shipping** scores destination support, deadline, cost, reliability, and approved preferences.
- **Pricing** recomputes discount, unit price, goods total, freight, landed total, gross profit, and margin.
- **Policy** checks ambiguity, stock, provenance, payment, delivery feasibility, and margin.
- **Approval** always ends at `human-review-required`.

Phrase polarity sounds like a small detail until a buyer writes:

> We need the controller, not the power brick, unless the 60W driver is required for installation.

A bag-of-words matcher can select the repeatedly mentioned driver. QuoteX penalizes negated and conditional alternatives, selects the controller, and escalates any remaining ambiguity.

If there is no trusted catalog match, the SKU becomes `CUSTOM-REVIEW`. A plausible-looking hallucinated SKU is never an acceptable fallback.

## Evidence is part of the product

Most agent demos end with a confident paragraph. QuoteX ends with a decision and the receipts.

![QuoteX Agent evidence showing six Qwen-selected tools, deterministic outputs, runtime, audit digest, and a blocked send gate](https://raw.githubusercontent.com/mongonsh/QuoteX/main/docs/screenshots/quotex-live-agent-evidence.png)

<figcaption>Every skill exposes who selected it, which trusted result it produced, and whether the human gate remains active.</figcaption>

For every run, the interface shows:

- live Qwen or guarded recovery;
- model and endpoint provenance;
- planner turns, latency, and token usage;
- all six skill calls and their deterministic outputs;
- selected SKU, route, quote arithmetic, and risks;
- a SHA-256 digest over sanitized decision evidence;
- the final approval state.

This makes a subtle failure visible. A correct quote produced during a provider outage can still be useful, but it must not be represented as successful Qwen reasoning.

## I tested the architecture against Qwen itself

I did not want the safety story to exist only in an architecture diagram. So I built a same-model adversarial evaluator.

Both systems receive the same `qwen3.7-plus` model, customer, catalog, memory, freight, pricing, and policy context:

- **Direct baseline:** Qwen returns the final commercial decision in one structured response.
- **QuoteX:** Qwen chooses typed tools while verified code owns their results.

The six cases test prompt injection, negated alternatives, inventory shortfall, an unknown product, an unsafe deadline, and repeat-buyer memory. Each case scores seven facts: SKU, quantity, unit price, freight, total integrity, risk coverage, and human approval.

| Architecture                       |                      Result |
| ---------------------------------- | --------------------------: |
| QuoteX governed Qwen tool agent    |             **42/42, 100%** |
| Direct single-prompt Qwen baseline |            **28/42, 66.7%** |
| Measured difference                | **+33.3 percentage points** |

All six governed cases used live Qwen. The direct baseline also returned all six responses, so provider failure did not create the difference.

This is a six-case engineering evaluation, not a production accuracy claim. Its purpose is narrower and useful: test whether executable trust boundaries protect exact commercial facts better than prompt instructions alone.

The full [protocol, per-case results, and limitations](https://github.com/mongonsh/QuoteX/blob/main/docs/EVALUATION.md) are public.

## The evaluator found my bugs

The first run was not 42/42.

It exposed two authority leaks in QuoteX:

1. The parser read `1,500` as `1` because the quantity expression did not support grouped commas.
2. Qwen could broaden its memory-search wording enough to make an unrelated preference affect a discount.

I fixed grouped-number parsing and added a regression test. I also changed the memory boundary: Qwen may request retrieval, but only the buyer's original message can establish relevance. Preference boosts now require evidence overlap.

The governed score moved from 40/42 to 42/42.

That history matters more than a perfect number. The evaluator was not submission decoration; it changed the system.

## One verified record, several useful outputs

QuoteX is multimodal, but the services are connected to one business goal rather than displayed as separate API demos:

- **Qwen3-ASR-Flash** transcribes seller and customer speech.
- **Qwen structured conversation** fills an editable product intake.
- **Qwen vision** grounds a creative brief in the uploaded product photo.
- **Qwen Image / Wan** creates a commercial product edit.
- **HappyHorse** animates the approved campaign frame.
- **Qwen Voice Design and Qwen TTS** provide a reusable customer-assistant voice.

![QuoteX campaign workspace showing an uploaded product photo and the Qwen-generated commercial edit](https://raw.githubusercontent.com/mongonsh/QuoteX/main/docs/screenshots/quotex-campaign-proof.jpg)

<figcaption>The campaign is derived from the same verified product and offer context, not a disconnected prompt.</figcaption>

Amazon, eBay, and Alibaba.com adapters also produce validation-first listing drafts with channel-specific title limits, condition mappings, missing-field warnings, and structured payloads.

Publishing remains disabled until marketplace OAuth and human approval are implemented. A button that pretends to publish would make the demo look bigger while making the engineering less honest.

## From local prototype to Alibaba Cloud

The browser application is served from [GitHub Pages](https://mongonsh.github.io/QuoteX/). Every protected API, commercial decision, and Qwen call runs on an Alibaba Cloud Function Compute backend in Tokyo.

![QuoteX deployed architecture connecting GitHub Pages, Alibaba Function Compute, Qwen Cloud, verified tools, persistence adapters, and human approval](https://raw.githubusercontent.com/mongonsh/QuoteX/main/diagrams/quotex-agent-architecture.png)

<figcaption>The deployed judge path and the durable production path are shown separately so the diagram does not overclaim active infrastructure.</figcaption>

The deployment path is executable, not a slide:

- the official FC3 SDK creates or updates the function and HTTP trigger;
- a custom-runtime ZIP provides the lightweight public judge deployment;
- strict CORS allows only the browser origin;
- protected routes keep Qwen credentials on Function Compute;
- structured logs carry Function Compute request and region context;
- health and smoke tests verify the real public boundary.

The current public judge deployment intentionally uses a bounded in-memory adapter and reports `durable: false`. Local development uses SQLite. The checked-in production path provisions Alibaba Tablestore for listings and run evidence, private OSS for product media, SLS for logs, and a least-privilege RAM execution role.

That distinction is visible because deployment proof should describe what is running, not what a diagram merely promises.

The [Function Compute deployment module](https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts) and [sanitized runtime evidence](https://github.com/mongonsh/QuoteX/blob/main/docs/alibaba-deployment-evidence.json) are both in the repository.

## Try it or inspect it

- **Live application:** [mongonsh.github.io/QuoteX](https://mongonsh.github.io/QuoteX/)
- **Demo video:** [Watch on YouTube](https://www.youtube.com/watch?v=AqyQlGGp_O8)
- **Source:** [github.com/mongonsh/QuoteX](https://github.com/mongonsh/QuoteX)
- **Architecture:** [source, PNG, SVG, and editable Excalidraw files](https://github.com/mongonsh/QuoteX/tree/main/diagrams)
- **Evaluation:** [methodology and limitations](https://github.com/mongonsh/QuoteX/blob/main/docs/EVALUATION.md)
- **Alibaba deployment proof:** [FC3 deployment code](https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts)

{% github mongonsh/QuoteX %}

To reproduce the non-secret checks:

```bash
npm install
npm test
npm run benchmark
npm run evaluate
npm run deploy:plan
```

With a Qwen Cloud key:

```bash
npm run evaluate -- --live
```

## The autonomy I want

Useful autonomy is not the absence of people. It is the removal of repetitive coordination before the smallest decision that deserves accountability.

For QuoteX, Qwen can understand ambiguity, choose work, recall context, and orchestrate multiple services at machine speed. Verified tools remain responsible for inventory, freight, arithmetic, margin, and policy. A person remains responsible for the promise made to the customer.

That is not less agentic.

It is the kind of agent I would trust inside a real business.

---

**Build note:** QuoteX was started on July 7, 2026. Its design, code, Qwen integrations, evaluation, Alibaba Cloud deployment, documentation, and demo were created during the hackathon submission period.
