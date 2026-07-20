import {
  buildAlibabaResourceNames,
  buildRuntimePolicy,
  provisionAlibabaInfrastructure
} from "../server/alibaba-cloud-infrastructure.js";
import { summarizeAlibabaError } from "../server/alibaba-error.js";
import { loadConfig, loadEnvironment } from "../server/config.js";
import { updateDotEnv } from "../server/dotenv-file.js";

try {
  const apply = process.argv.slice(2).includes("--apply");
  const [appConfig, env] = await Promise.all([loadConfig(), loadEnvironment()]);

  if (!apply) {
    const accountId = env.ALIBABA_CLOUD_ACCOUNT_ID || "<account-id>";
    const names = buildAlibabaResourceNames({ accountId, env });
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          resources: names,
          runtimePolicy: buildRuntimePolicy(names),
          note:
            "No cloud API call was made. Apply resolves the real account ID through STS and creates or reuses each resource."
        },
        null,
        2
      )
    );
  } else {
    const result = await provisionAlibabaInfrastructure({
      appConfig,
      env,
      onProgress(message) {
        console.log(`[Alibaba Cloud] ${message}`);
      }
    });
    await updateDotEnv(".env", result.environment);
    console.log(
      JSON.stringify(
        {
          ok: true,
          accountId: result.accountId,
          roleArn: result.roleArn,
          resources: result.resources,
          steps: result.steps,
          updatedEnvironmentNames: Object.keys(result.environment)
        },
        null,
        2
      )
    );
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: summarizeAlibabaError(error) }, null, 2));
  process.exitCode = 1;
}
