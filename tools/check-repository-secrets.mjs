import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  {
    label: "private key",
    expression: /-----BEGIN (?:EC |OPENSSH |PGP |RSA )?PRIVATE KEY-----/
  },
  {
    label: "Alibaba access key",
    expression: /\bLTAI[A-Za-z0-9]{12,}\b/
  },
  {
    label: "provider API key",
    expression: /\bsk-[A-Za-z0-9_-]{20,}\b/
  },
  {
    label: "credential literal",
    expression:
      /\b(?:password|passwd|secret|accessToken|apiKey|accessKeySecret)\s*[:=]\s*["'][^"'<>$\s]{8,}["']/i
  }
];

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean)
  .filter((path) => path !== "tools/check-repository-secrets.mjs");

const findings = [];

for (const path of trackedFiles) {
  const bytes = readFileSync(path);
  if (bytes.includes(0)) continue;

  const lines = bytes.toString("utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const pattern of patterns) {
      if (pattern.expression.test(line)) {
        findings.push(`${path}:${index + 1} (${pattern.label})`);
      }
    }
  }
}

if (findings.length) {
  console.error("Potential committed secrets detected:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${trackedFiles.length} tracked files.`);
}
