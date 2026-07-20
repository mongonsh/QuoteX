import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const runtimeRoot = resolve(".runtime/alibaba-fc");
const staging = join(runtimeRoot, "package");
const output = join(runtimeRoot, "quotex-fc.zip");
const maxTransportSafeBytes = 70_000_000;
const distRoot = resolve("dist");

await rm(staging, { recursive: true, force: true });
await mkdir(join(staging, "src"), { recursive: true });
await mkdir(runtimeRoot, { recursive: true });

await Promise.all([
  cp(distRoot, join(staging, "dist"), {
    recursive: true,
    filter: includeRuntimeFile
  }),
  cp(resolve("assets"), join(staging, "assets"), { recursive: true }),
  copyFile(resolve("index.html"), join(staging, "index.html")),
  copyFile(resolve("src/styles.css"), join(staging, "src/styles.css"))
]);

await writeFile(
  join(staging, "package.json"),
  `${JSON.stringify(
    {
      name: "quotex-function-compute",
      private: true,
      type: "module",
      engines: { node: "20.x" }
    },
    null,
    2
  )}\n`,
  "utf8"
);

await rm(output, { force: true });
await run("zip", ["-q", "-r", "-y", output, "."], {
  cwd: staging,
  maxBuffer: 10 * 1024 * 1024
});

const zip = await readFile(output);
if (zip.length > maxTransportSafeBytes) {
  throw new Error(
    `Function package is ${zip.length} bytes; keep it below ${maxTransportSafeBytes} bytes so the Base64 API request remains under Function Compute's 100 MB limit.`
  );
}

const manifest = {
  artifact: output,
  sizeBytes: zip.length,
  sha256: createHash("sha256").update(zip).digest("hex"),
  runtime: "custom.debian10",
  executable: "/var/fc/lang/nodejs20/bin/node",
  platform: "Alibaba Cloud Function Compute",
  generatedAt: new Date().toISOString()
};
await writeFile(
  join(runtimeRoot, "deployment-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
);

console.log(JSON.stringify({ ok: true, ...manifest }, null, 2));

function includeRuntimeFile(source) {
  const path = relative(distRoot, source);
  if (!path) return true;
  if (basename(path) === ".DS_Store" || path.endsWith(".map")) return false;

  const [topLevel, child] = path.split(sep);
  if (topLevel === "tests") return false;
  if (topLevel === "tools") return child === undefined || child === "serve.js";
  return true;
}
