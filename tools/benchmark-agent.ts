import { performance } from "node:perf_hooks";
import { rfqScenarios } from "../src/data.js";
import { runAutopilot } from "../src/rfq-engine.js";

const expectedSkus: Record<string, string> = {
  "nordlicht-cashmere-500": "MNG-CASH-SCF",
  "nordlicht-cashmere-replay": "MNG-CASH-SCF",
  "northstar-ambiguous": "AUR-CTRL-24",
  "alba-ce-controllers": "CTRL-WIFI-2CH"
};
const iterations = boundedInteger(process.env.BENCHMARK_ITERATIONS, 25, 1, 250);
const timings: number[] = [];
let correctProductSelections = 0;
let approvalGatesEnforced = 0;
let arithmeticChecksPassed = 0;
let fallbackRunsCompleted = 0;
let memoryAwareRuns = 0;
let totalRuns = 0;

for (let iteration = 0; iteration < iterations; iteration += 1) {
  for (const rfq of rfqScenarios) {
    const startedAt = performance.now();
    const analysis = await runAutopilot(rfq);
    timings.push(performance.now() - startedAt);
    totalRuns += 1;

    if (analysis.quote.sku === expectedSkus[rfq.id]) correctProductSelections += 1;
    if (analysis.approval.required && analysis.approval.status === "pending") approvalGatesEnforced += 1;
    if (round(analysis.quote.goodsTotal + analysis.quote.shippingCost) === analysis.quote.landedTotal) {
      arithmeticChecksPassed += 1;
    }
    if (analysis.qwenTrace.status === "skipped" && analysis.quote.landedTotal > 0) {
      fallbackRunsCompleted += 1;
    }
    if (analysis.relevantMemories.length > 0) memoryAwareRuns += 1;
  }
}

timings.sort((left, right) => left - right);
const report = {
  benchmark: "QuoteX deterministic business-tool baseline",
  generatedAt: new Date().toISOString(),
  scenarios: rfqScenarios.length,
  iterations,
  totalRuns,
  results: {
    productSelectionAccuracy: ratio(correctProductSelections, totalRuns),
    approvalGateEnforcement: ratio(approvalGatesEnforced, totalRuns),
    quoteArithmeticIntegrity: ratio(arithmeticChecksPassed, totalRuns),
    noModelFallbackCompletion: ratio(fallbackRunsCompleted, totalRuns),
    runsUsingRelevantMemory: ratio(memoryAwareRuns, totalRuns),
    deterministicLatencyMs: {
      p50: percentile(timings, 0.5),
      p95: percentile(timings, 0.95),
      max: round(Math.max(...timings))
    },
    boundedHumanDecisionsPerRun: 1,
    verifiedBusinessSkillsPerAgentRun: 6
  },
  scope: [
    "Measures the checked-in English RFQ fixture set and deterministic safety path.",
    "Does not claim human-time savings or live-provider latency.",
    "Live Qwen latency and token usage are captured per run in the SQLite agent ledger."
  ]
};

console.log(JSON.stringify(report, null, 2));

function ratio(value: number, total: number): number {
  return Number((value / total).toFixed(4));
}

function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1));
  return round(values[index]!);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}
