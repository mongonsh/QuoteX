# QuoteX judging scorecard

This document maps the implementation directly to the published judging rubric. It separates code-backed evidence from submission evidence that still requires a real public URL or recording.

## Technical Depth and Engineering - 30%

| Judge question | Concrete evidence | Verify |
| --- | --- | --- |
| Is Qwen used as more than a chat wrapper? | Qwen3.7 runs a bounded function-calling loop and chooses six strict custom commerce skills | `server/qwen-tool-orchestrator.ts`, **Agent evidence** |
| Are facts and side effects controlled? | Typed tools own catalog, memory, shipping, quote arithmetic, risk, and approval; the model cannot set price or send | `src/rfq-engine.ts`, tool schemas, approval tests |
| Is there non-trivial engineering? | Phrase-polarity product matcher, memory-query isolation, freight scoring, margin-floor pricing, missing-tool repair, SHA-256 evidence digest | Engine, orchestrator, benchmarks |
| Is execution persistent and inspectable? | Tablestore stores the last 200 cloud runs with model, turns, calls, coverage, latency, gate, and sanitized evidence; SQLite is the local adapter | `server/alibaba-storage.ts`, `/api/agent-runs` |
| Does it fail safely? | Missing key, timeout, quota, malformed response, omitted tool, unknown SKU, and provider failure have explicit paths | Orchestrator tests and architecture failure matrix |
| Is the code modular and typed? | Strict TypeScript contracts separate browser, API, Qwen adapters, domain tools, stores, and media services | `src/types.ts`, `server/`, `npm run typecheck` |
| Is there integration depth? | Qwen planning, ASR, vision, Voice Design, TTS, Wan/Qwen image generation, and HappyHorse tasks share one governed workflow | Service modules and live health metadata |
| Is production behavior considered? | Private API gate, redacted contacts, body limits, Tablestore/OSS persistence, scoped RAM role, SLS tracing, tested AMD64 container, and idempotent FC3 deployment | `tools/serve.ts`, `server/alibaba-cloud-infrastructure.ts`, `server/alibaba-fc-deployment.ts`, `Dockerfile` |
| Is the advantage measured? | Same-model adversarial comparison: governed Qwen tools passed 42/42 checks; direct one-prompt Qwen passed 28/42 | `npm run evaluate -- --live`, `docs/EVALUATION.md` |

## Innovation and AI Creativity - 30%

| Judge question | Concrete evidence | Verify |
| --- | --- | --- |
| What is novel? | A governed commerce agent where Qwen chooses skills while deterministic code retains commercial authority | **Agent evidence** trust-boundary panel |
| Does the agent improve across sessions? | Only approved outcomes become customer-scoped memories; the 800-scarf repeat order visibly recalls the approved price and DHL Economy route | `src/memory-store.ts`, Nordlicht memory-replay scenario |
| Is multimodality purposeful? | One product record moves from voice/text intake to photo understanding, campaign image, product video, and spoken customer support | **Add a product**, **Campaign**, **Customer assistant** |
| Is recovery honest? | Guarded recovery uses the same tool core, is labeled as non-live, and is persisted instead of masquerading as model success | Mode switch, evidence status, recovery tests |
| Did evaluation improve the architecture? | Adversarial runs found and fixed comma-quantity parsing plus model-expanded memory relevance | Evaluation history and regression tests |
| Is the model visible and accountable? | Each skill says whether Qwen selected it or a guardrail completed it; model, turns, runtime, tokens, and digest remain inspectable | **Agent evidence** |
| Does AI reduce user effort? | Conversational intake fills editable product fields and asks only for the highest-priority missing fact | Seller intake assistant and dual-storage listing tests |

## Problem Value and Impact - 25%

| Judge question | Concrete evidence | Verify |
| --- | --- | --- |
| Is the pain authentic? | Export teams receive ambiguous messages and must reconcile customer history, product identity, stock, freight, margin, and terms | English RFQ scenarios and demo narrative |
| Is the product broadly useful? | Intake supports electronics, fashion, home, beauty, collectibles, sports, industrial goods, and resale items | Product category contract and **Add a product** |
| Does it save accountable work? | One run assembles a review-ready offer and evidence while preserving one bounded human decision | Request workflow and approval gate |
| Can it become a product? | Typed storage, catalog, freight, media, and marketplace boundaries can be replaced by authenticated services | Architecture scale path |
| Can it reach existing channels? | Amazon, eBay, and Alibaba.com adapters produce platform-specific validation drafts without pretending to publish | `src/marketplace-adapters.ts`, **Campaign** |
| Is impact measurable? | Checked-in 100-run baseline measures selection, arithmetic, gate enforcement, fallback completion, and deterministic latency | `npm run benchmark`, `docs/BENCHMARKS.md` |

## Presentation and Documentation - 15%

| Judge question | Concrete evidence | Verify |
| --- | --- | --- |
| Is the demo understandable? | The 102-second Remotion film connects messy intake, Qwen planning, inspectable execution, human approval, media, marketplaces, voice, and recovery in one visual story | `docs/CINEMATIC_DEMO.md`, `demo/motion/` |
| Is key logic visualized? | Six skills, source of execution, trusted result, runtime, gate, and digest are visible without opening code | **Agent evidence** |
| Is architecture clear? | Diagram, tool contracts, request flow, persistence, failures, threat model, and API surface are documented | `docs/ARCHITECTURE.md`, `diagrams/` |
| Is reproduction clear? | README includes model routing, environment contract, local setup, probes, tests, benchmark, and deployment path | `README.md` |
| Is cloud proof repeatable? | Dry-run/apply commands provision managed storage and RAM, publish an immutable ACR image, and create or update FC and its trigger while redacting secrets | `npm run provision:plan`, `npm run image:plan`, `npm run deploy:plan` |
| Is it open source? | Root MIT license and package metadata are present | `LICENSE`, `package.json` |

## Measured evidence

Latest checked-in fixture baseline, 100 deterministic runs:

- Product selection accuracy: 100%
- Quote arithmetic integrity: 100%
- Approval gate enforcement: 100%
- No-model fallback completion: 100%
- Relevant-memory usage: 50% of fixtures, exactly matching the scenarios that contain relevant evidence
- Deterministic p50 latency: about 0.03 ms
- Deterministic p95 latency: about 0.22 ms

These are engineering regression metrics, not a human productivity study. Live Qwen latency, planner turns, tool count, and usage are recorded per agent run.

Latest same-model adversarial result:

- QuoteX live Qwen tool agent: 42/42 checks, 100%
- Direct single-prompt Qwen baseline: 28/42 checks, 66.7%
- Difference: +33.3 percentage points
- Live governed runs: 6/6; guarded recoveries: 0; baseline provider errors: 0

The exact protocol and limitations are in `docs/EVALUATION.md`.

## Owner evidence still required

- Upload the finished 102-second `.runtime/demo/QuoteX-motion-demo.mp4` to a public or unlisted Devpost-supported host.
- Confirm `https://github.com/mongonsh/QuoteX` is public and includes `server/alibaba-fc-deployment.ts`; use that public code URL as the required Alibaba Cloud API proof.
- Replace the demo-video placeholder in `docs/DEVPOST_SUBMISSION.md`.
- The published submission format requires the Alibaba code-file link. A public Function Compute URL and console recording are separate, stronger runtime evidence and must be included only if the real apply succeeds.

Do not claim a public deployment or recording until the real evidence exists.
