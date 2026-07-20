import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildAlibabaContainerImagePlan,
  serializeAlibabaContainerImagePlan
} from "../server/alibaba-container-image.js";
import { loadEnvironment } from "../server/config.js";
import { updateDotEnv } from "../server/dotenv-file.js";

const apply = process.argv.slice(2).includes("--apply");
const env = await loadEnvironment();
const plan = buildAlibabaContainerImagePlan({ env });

if (!apply) {
  console.log(JSON.stringify(serializeAlibabaContainerImagePlan(plan), null, 2));
  console.log(
    plan.readiness.readyToApply
      ? "\nDry run passed. Re-run with --apply to build and push the image."
      : "\nDry run found blockers. No container command was run."
  );
  process.exit(0);
}

if (!plan.readiness.readyToApply) {
  throw new Error(`Image publication is not ready: ${plan.readiness.blockers.join(" ")}`);
}

await run(plan.containerEngine, ["info", "--format", "json"]);
await run(plan.containerEngine, [
  "build",
  "--platform",
  plan.platform,
  "--format",
  "docker",
  "--tag",
  plan.taggedImage,
  "."
]);
await run(
  plan.containerEngine,
  ["login", "--username", plan.username, "--password-stdin", plan.registry],
  `${env.ALIBABA_ACR_PASSWORD}\n`
);

const digestPath = resolve(".runtime", "alibaba-image-digest.txt");
await mkdir(resolve(".runtime"), { recursive: true });
try {
  await run(plan.containerEngine, [
    "push",
    "--digestfile",
    digestPath,
    plan.taggedImage
  ]);
} finally {
  await run(plan.containerEngine, ["logout", plan.registry], undefined, true);
}

const digest = (await readFile(digestPath, "utf8")).trim();
if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
  throw new Error("Container Registry did not return a valid immutable image digest.");
}

const immutableImage = `${plan.repositoryUri}@${digest}`;
await updateDotEnv(".env", {
  ALIBABA_ACR_TAG: plan.tag,
  ALIBABA_FC_IMAGE: immutableImage
});

console.log(
  JSON.stringify(
    {
      ok: true,
      platform: plan.platform,
      taggedImage: plan.taggedImage,
      digest,
      immutableImage,
      updatedEnvironmentNames: ["ALIBABA_ACR_TAG", "ALIBABA_FC_IMAGE"]
    },
    null,
    2
  )
);

async function run(
  command: string,
  args: string[],
  stdin?: string,
  tolerateFailure = false
): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: [stdin === undefined ? "inherit" : "pipe", "inherit", "inherit"]
    });

    if (stdin !== undefined) child.stdin?.end(stdin);
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0 || tolerateFailure) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${args[0] || ""} exited with status ${code}.`));
    });
  });
}
