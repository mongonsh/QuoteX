import { evaluateAgentArchitectures } from "../server/agent-evaluation.js";
import { loadConfig } from "../server/config.js";

const args = new Set(process.argv.slice(2));
const live = args.has("--live");
const baselineOnly = args.has("--baseline-only");
const config = await loadConfig();
const report = await evaluateAgentArchitectures({
  config,
  liveGoverned: live && !baselineOnly,
  liveBaseline: live
});

console.log(JSON.stringify(report, null, 2));
