# QuoteX benchmark methodology

## Purpose

`npm run benchmark` is a deterministic engineering regression baseline. It checks whether the trusted commerce core keeps selecting the intended product, calculating the same offer, enforcing human approval, completing safely without a model, and using memory only where relevant.

It is not a production load test or a claim about human productivity.

## Fixture set

The benchmark repeats the checked-in scenarios 100 times. The set includes:

- a direct product request;
- a repeat-customer request with relevant approved history;
- a request with a delivery constraint;
- an ambiguous phrase containing a negated and conditional product alternative;
- a no-model guarded-recovery path.

Every iteration starts from the same trusted customer, catalog, route, and policy fixtures. That makes regressions reproducible in CI and on a judge's machine.

## Metrics

| Metric | Definition | Expected |
| --- | --- | --- |
| Product selection accuracy | Selected trusted SKU equals the declared fixture target | 100% |
| Quote arithmetic integrity | Unit, freight, discount, total, and margin values match deterministic recomputation | 100% |
| Approval gate enforcement | Every workflow ends at `human-review-required` | 100% |
| No-model fallback completion | All six required skills finish when the Qwen planner is unavailable | 100% |
| Relevant-memory usage | Memory appears only in fixtures with matching evidence | 50% for the current balanced fixture set |
| Deterministic latency | Wall time for the local domain pipeline, excluding network inference | Report p50, p95, and max |

## Latest local result

The latest verified 100-run result during submission preparation was:

```text
productSelectionAccuracy: 1.00
quoteArithmeticIntegrity: 1.00
approvalGateEnforcement: 1.00
noModelFallbackCompletion: 1.00
runsUsingRelevantMemory: 0.50
deterministicLatencyP50Ms: 0.03
deterministicLatencyP95Ms: 0.22
deterministicLatencyMaxMs: 2.17
```

Latency varies by machine, so the command output at judging time is the authoritative measurement. Accuracy and gate metrics must remain exact.

## Live Qwen evidence

Network model performance is intentionally measured separately. Each live agent run persists:

- model and safe endpoint host;
- planner turns and tool-call count;
- completed and required skills;
- end-to-end latency;
- token usage when the provider returns it;
- live or guarded-recovery status;
- mandatory approval state;
- SHA-256 audit digest.

This avoids mixing sub-millisecond deterministic domain timing with model/network latency.

## Run it

```bash
npm run benchmark
```

Any result below 100% for product selection, arithmetic, gate enforcement, or fallback completion is a release blocker.

## Adversarial architecture evaluation

The deterministic benchmark answers “did trusted code regress?” A separate live evaluation answers “does the governed architecture outperform a one-prompt agent on the same Qwen model and context?”

```bash
npm run evaluate -- --live
```

The latest live run covered six adversarial cases and seven criteria per case:

```text
QuoteX governed Qwen agent: 42/42 (100%)
Direct single-prompt Qwen:  28/42 (66.7%)
Measured difference:        +33.3 percentage points
Live governed runs:         6/6
Baseline provider errors:   0
```

See [EVALUATION.md](EVALUATION.md) for the fair-comparison protocol, case-level failures, bugs discovered by the evaluator, semantic risk matching, and limitations. The compact machine-readable result is [evaluation-result.json](evaluation-result.json).
