import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildAlibabaFcDeploymentPlan,
  createAlibabaFcFunction,
  serializeAlibabaFcPlan
} from "../server/alibaba-fc-deployment.js";
import { summarizeAlibabaError } from "../server/alibaba-error.js";
import { loadConfig, loadEnvironment } from "../server/config.js";
import { getDesignedVoiceStatus } from "../server/qwen-tts.js";

try {
  const apply = process.argv.slice(2).includes("--apply");
  const [appConfig, env] = await Promise.all([loadConfig(), loadEnvironment()]);
  const designedVoice = await getDesignedVoiceStatus({ config: appConfig });
  if (!appConfig.qwen.ttsVoice && designedVoice.voice) {
    appConfig.qwen.ttsVoice = designedVoice.voice;
  }
  const codePackagePath =
    env.ALIBABA_FC_CODE_ZIP ||
    (env.ALIBABA_FC_DEPLOYMENT_MODE === "code"
      ? ".runtime/alibaba-fc/quotex-fc.zip"
      : "");
  const codePackage = codePackagePath
    ? { base64: (await readFile(resolve(codePackagePath))).toString("base64") }
    : undefined;
  const plan = buildAlibabaFcDeploymentPlan({ appConfig, env, codePackage });

  if (!apply) {
    console.log(JSON.stringify(serializeAlibabaFcPlan(plan), null, 2));
    console.log(
      plan.readiness.readyToApply
        ? "\nDry run passed. Re-run with --apply to call FC/2023-03-30 CreateFunction."
        : "\nDry run found blockers. No Alibaba Cloud API call was made."
    );
  } else {
    const result = await createAlibabaFcFunction(plan, appConfig.storage);
    console.log(JSON.stringify({ ok: true, api: plan.api, ...result }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: summarizeAlibabaError(error) }, null, 2));
  process.exitCode = 1;
}
