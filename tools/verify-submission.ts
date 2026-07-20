import { access, readFile } from "node:fs/promises";

interface SubmissionCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

const checks: SubmissionCheck[] = [];
const devpost = await readText("docs/DEVPOST_SUBMISSION.md");
const deploymentCode = await readText("server/alibaba-fc-deployment.ts");
const readme = await readText("README.md");

await fileCheck("license", "MIT license", "LICENSE");
await fileCheck("diagram-png", "Rendered architecture PNG", "diagrams/quotex-agent-architecture.png");
await fileCheck("diagram-svg", "Rendered architecture SVG", "diagrams/quotex-agent-architecture.svg");
await fileCheck("diagram-source", "Editable architecture source", "diagrams/quotex-agent-architecture.excalidraw");
await fileCheck("evaluation", "Governed-agent evaluation", "docs/EVALUATION.md");
await fileCheck("evaluation-json", "Machine-readable evaluation result", "docs/evaluation-result.json");

checks.push({
  id: "track",
  label: "Track identified",
  passed: /Track 4:\s*Autopilot Agent/i.test(devpost),
  detail: "Devpost draft must explicitly name Track 4: Autopilot Agent."
});
checks.push({
  id: "public-repository",
  label: "Public repository URL",
  passed: /https:\/\/github\.com\/mongonsh\/QuoteX/i.test(devpost),
  detail: "Confirm the repository is publicly accessible before submission."
});
checks.push({
  id: "alibaba-sdk",
  label: "Alibaba Cloud API proof",
  passed:
    deploymentCode.includes("@alicloud/fc20230330") &&
    deploymentCode.includes("createFunction") &&
    deploymentCode.includes("CreateFunctionInput"),
  detail: "Proof must use the official FC3 SDK and a real CreateFunction request."
});
checks.push({
  id: "alibaba-proof-link",
  label: "Alibaba proof linked in Devpost",
  passed: /server\/alibaba-fc-deployment\.ts/i.test(devpost),
  detail: "The submission must link directly to the public deployment code."
});
checks.push({
  id: "demo-video",
  label: "Public three-minute demo video",
  passed: !devpost.includes("<DEMO_VIDEO_URL>") && /Demo video:\s*https?:\/\//i.test(devpost),
  detail: "Record, publish, and replace <DEMO_VIDEO_URL>."
});
checks.push({
  id: "no-secret-example",
  label: "Secret handling documented",
  passed: readme.includes("Secrets are read only on the server") && readme.includes(".env"),
  detail: "README must explain server-side secret handling."
});

const passed = checks.filter((check) => check.passed).length;
const blockers = checks.filter((check) => !check.passed);
const report = {
  ready: blockers.length === 0,
  passed,
  total: checks.length,
  blockers: blockers.map(({ id, label, detail }) => ({ id, label, detail })),
  checks
};

console.log(JSON.stringify(report, null, 2));
if (blockers.length) process.exitCode = 1;

async function fileCheck(id: string, label: string, path: string): Promise<void> {
  try {
    await access(path);
    checks.push({ id, label, passed: true, detail: path });
  } catch {
    checks.push({ id, label, passed: false, detail: `Missing ${path}` });
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}
