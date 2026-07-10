# Judging scorecard

The official rubric weights Innovation & AI Creativity at 30%, Technical Depth & Engineering at 30%, Problem Value & Impact at 25%, and Presentation & Documentation at 15%.

## Innovation & AI Creativity — 30%

| Evidence | Where to verify |
| --- | --- |
| Multilingual Qwen extraction with normalized structured output | `server/qwen-parser.ts`, Qwen Trace tab |
| Persistent customer experience changes later RFQs | `src/memory-store.ts`, Mori memory-replay scenario |
| Qwen text + Qwen-Image Edit multimodal workflow | `server/marketing-asset.ts`, Creative tab |
| Model/tool/human boundary is explicit | Execution chips, proof cards, architecture document |

## Technical Depth & Engineering — 30%

| Evidence | Where to verify |
| --- | --- |
| Modular catalog, memory, freight, pricing, and risk tools | `src/rfq-engine.ts` |
| Graceful Qwen failure with honest fallback | `src/qwen-client.ts`, `server/qwen-parser.ts` |
| Bounded, expiring, versioned memory | `src/memory-store.ts` |
| Prompt-injection defense and output normalization | `server/qwen-parser.ts` |
| Secret-safe server boundary and HTTP hardening | `tools/serve.ts` |
| Strict shared contracts and zero type errors | `src/types.ts`, `tsconfig.json`, `npm run typecheck` |
| Automated deterministic and multimodal tests | `tests/` |
| Cloud-ready AMD64 container | `Dockerfile`, `docs/DEPLOYMENT.md` |

## Problem Value & Impact — 25%

| Evidence | Where to verify |
| --- | --- |
| Real export-sales pain: ambiguous messages, stock, margin, freight, terms | Three customer scenarios and one memory replay |
| Measurable decision support | Pricing effect, routing-confidence lift, policy counts, escalations |
| Scalable contracts | Replaceable memory store, catalog/freight tools, server API boundary |
| Safe productization | Mandatory human gate; no outbound send endpoint |

## Presentation & Documentation — 15%

| Evidence | Where to verify |
| --- | --- |
| Judge-first product narrative | Hero, proof cards, three-minute demo script |
| Key logic visualized | Timeline execution labels and Qwen Trace |
| Architecture and threat model | `docs/ARCHITECTURE.md` |
| Repeatable cloud deployment and proof checklist | `docs/DEPLOYMENT.md` |
| Open-source eligibility | root `LICENSE` and package MIT metadata |

## Evidence still requiring the project owner

- Real public Function Compute URL.
- Separate Alibaba Cloud deployment-proof recording.
- Final demo video following the tested script.
- Devpost description and screenshots updated to match QuoteX branding.
- Repository About section set to the live URL with MIT license detected.
