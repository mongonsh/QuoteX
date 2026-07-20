# Alibaba Cloud deployment and proof

QuoteX implements an executable Alibaba Cloud backend deployment:

- **Function Compute** runs either an ACR-free code package or the AMD64 custom container and exposes the public HTTPS trigger.
- **Tablestore** keeps validated seller listings and inspectable agent-run evidence.
- **OSS** keeps original product photos in a private, encrypted bucket.
- **SLS** receives structured request, instance, and LLM metrics.
- **RAM** gives the function short-lived, least-privilege storage credentials.
- **ACR** holds the immutable production container image.

The implementation is in [server/alibaba-cloud-infrastructure.ts](../server/alibaba-cloud-infrastructure.ts), [server/alibaba-storage.ts](../server/alibaba-storage.ts), and [server/alibaba-fc-deployment.ts](../server/alibaba-fc-deployment.ts). Provisioning and deployment are dry-run by default and apply only through explicit commands.

## Devpost proof contract

The published hackathon requirements specify a direct repository code-file link as the proof artifact for Alibaba Cloud deployment. The required link is:

```text
https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts
```

That file uses the official `@alicloud/fc20230330` SDK to create or update either a custom-runtime code package or Custom Container function, wait for readiness, and create or update its HTTP trigger. The infrastructure and storage modules provide additional inspectable proof of Tablestore, OSS, SLS, RAM, and Alibaba temporary-credential use.

A dry run proves request construction without changing cloud state. It is not presented as a live Function Compute deployment. Runtime URL, artifact digest, and health evidence below were added only after the explicit apply sequence succeeded.

## Verified live deployment

The ACR-free path is live in Alibaba Cloud Function Compute:

```text
Application: https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run
Health:      https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run/api/health
Region:      ap-northeast-1 (Japan/Tokyo)
Function:    quotex-autopilot
Runtime:     custom.debian10 with the built-in Node.js 20 executable
Source:      063a7c35049ef09e41d23741ac80e533506b89ac
ZIP SHA-256: 7884c54f400f3e8d5eead76c34caaf50039f5dce47a8ab3754ad45524c5ec75d
```

At `2026-07-20T18:17:03.303Z`, verification returned:

- `200` from the application and public health endpoint;
- `401` from a paid API without the private access token;
- `200` from an authenticated `/api/parse-rfq` request;
- live `qwen3.7-plus` provenance, quantity `500`, destination `Berlin distribution center`, confidence `0.98`, and 2,730 ms model latency.

The sanitized, machine-readable record is [alibaba-deployment-evidence.json](alibaba-deployment-evidence.json). The current public judge route uses memory storage and reports `durable: false`. It does not claim that the separately implemented Tablestore/OSS production path is active.

## Free-trial route

Use Alibaba Cloud **product trials**, not a solution trial:

1. Complete account identity verification and attach a supported payment method.
2. Open the [Function Compute console](https://fc.console.alibabacloud.com/), activate the service, and accept its terms. This account-owner action cannot be performed by the deployment SDK.
3. Claim the OSS Standard LRS product trial before activating OSS if the account is eligible.
4. Use ACR Personal Edition in Japan (Tokyo), which is free during its public preview.
5. Activate Tablestore only after accepting that it is pay-as-you-go. QuoteX uses a Capacity instance, no search index, zero reserved throughput, bounded scans, at most 1,000 listings, and at most 200 retained agent runs.

The [Alibaba Cloud free-trial rules](https://www.alibabacloud.com/help/en/user-center/product-overview/learn-about-free-trials) require first use of each eligible product. A solution trial is an isolated POC account with a maximum total duration of 168 hours; its resources and data are deleted when the trial ends and cannot be retained. It is therefore unsuitable for the durable public judge URL.

Function Compute's first-use quota and the OSS storage trial reduce the main runtime and storage costs. Tablestore does not advertise a matching core database trial: instance creation is free, while stored bytes and actual read/write CUs are pay-as-you-go. At hackathon scale those units are tiny, but they are not represented as free. OSS request and outbound traffic charges are also outside the storage-capacity trial.

## ACR-free judge deployment

The lightweight deployment avoids Container Registry entirely:

```bash
npm run deploy:prepare
npm run deploy:package
```

Set these private `.env` values:

```dotenv
ALIBABA_FC_DEPLOYMENT_MODE=code
ALIBABA_FC_CODE_ZIP=.runtime/alibaba-fc/quotex-fc.zip
QUOTEX_STORAGE_PROVIDER=memory
```

`deploy:package` builds a transport-safe ZIP containing only the compiled server, browser bundle, and assets. Function Compute starts it with `/var/fc/lang/nodejs20/bin/node` under `custom.debian10`. The deployment planner rejects `sqlite` in this mode because the managed Node.js 20 runtime does not provide `node:sqlite`.

Memory mode is useful for a public hackathon walkthrough but is deliberately reported as `durable: false`: listings and run history can disappear after a cold start or instance replacement. Set `QUOTEX_STORAGE_PROVIDER=alibaba` and configure Tablestore, OSS, and the execution role for durable storage.

## Container contract

QuoteX is prepared for an Alibaba Cloud Function Compute custom container:

- listens on `0.0.0.0:9000` by default;
- compiles with `npm run build` and starts with `node dist/tools/serve.js`;
- provides `GET /api/health`;
- has no runtime package installation step;
- keeps Qwen credentials in environment variables;
- uses Tablestore and private OSS in cloud mode, with SQLite only as a local fallback;
- can be built as `linux/amd64`, the architecture required by Function Compute.
- reads Function Compute request ID, function name, and region headers;
- emits structured request logs that Simple Log Service can collect;
- never logs Function Compute temporary credential headers.

Alibaba Cloud's official documentation requires custom-container HTTP servers to listen on `0.0.0.0:CAPort` and notes that ARM-based development machines must build for `linux/amd64`:

- [Function Compute custom container overview](https://www.alibabacloud.com/help/en/functioncompute/fc/custom-container/)
- [FC3 SDK reference](https://www.alibabacloud.com/help/en/functioncompute/fc/developer-reference/sdk-reference-20230330)
- [FC3 CreateFunction API](https://www.alibabacloud.com/help/en/functioncompute/fc/developer-reference/api-fc-2023-03-30-createfunction)
- [Custom Container context and SLS logs](https://www.alibabacloud.com/help/en/functioncompute/fc/user-guide/context-and-log-format)

## 1. Prepare private deployment values

```bash
npm run deploy:prepare
```

This creates a random `QUOTEX_ACCESS_TOKEN` and copies the already-designed Qwen voice ID into `.env`. It prints only which values were generated, never their contents. Opening the final URL as `https://.../?access=<token>` sets a secure, HTTP-only cookie and removes the token from the address bar. `/api/health` remains public; listing, voice, image, video, and agent APIs require access.

## 2. Create a temporary provisioning identity

Create a programmatic RAM user rather than a main-account AccessKey. In **RAM > Permissions > Policies**, create a custom JSON policy named `QuoteXTemporaryProvisioner` from [deployment/alibaba-provisioner-policy.json](../deployment/alibaba-provisioner-policy.json), then grant that policy to the RAM user. It permits only the Tablestore, OSS, SLS, RAM, and FC actions called by this deployer. Remove the policy and disable or delete the AccessKey immediately after deployment.

Put the credentials only in `.env`:

```env
ALIBABA_CLOUD_ACCESS_KEY_ID=<temporary RAM user key ID>
ALIBABA_CLOUD_ACCESS_KEY_SECRET=<temporary RAM user key secret>
```

The secret is displayed once by Alibaba Cloud. Never paste it into an issue, commit, screenshot, or chat.

If provisioning reports `AccessDenied`, its `missingAction` field names the exact denied permission. Do not grant `AdministratorAccess`; update the temporary custom policy only if the deployer genuinely needs another documented action.

## 3. Provision managed data and observability

Review the deterministic plan, then apply it:

```bash
npm run provision:plan
npm run provision:alibaba
```

The apply command creates or reuses the Tokyo-region Capacity Tablestore instance and two tables, private OSS bucket, SLS project and Logstore, FC execution role, and least-privilege runtime policy. It writes only non-secret resource coordinates back to `.env`.

The Tablestore tables use zero reserved throughput and no search indexes. The runtime role can read and write only the two QuoteX tables, the `quotex/` OSS prefix, and the selected Logstore. Function Compute receives temporary credentials from this role; the long-lived provisioning key is not copied into the function.

## 4. Create the ACR repository

ACR Personal Edition is free during public preview but does not provide public provisioning APIs. In the Alibaba Cloud console:

1. Select **Japan (Tokyo)** and create the Personal Edition instance.
2. Set the registry login password.
3. Create namespace `quotex`.
4. Create private repository `agent`.
5. Copy the host, username, and password from the repository's push instructions:

```env
ALIBABA_ACR_REGISTRY=<registry host without https://>
ALIBABA_ACR_NAMESPACE=quotex
ALIBABA_ACR_REPOSITORY=agent
ALIBABA_ACR_USERNAME=<registry username>
ALIBABA_ACR_PASSWORD=<registry login password>
```

The ACR instance, repository, and FC function must use the same Alibaba account and region.

## 5. Build and publish the immutable image

```bash
npm run image:plan
npm run image:publish
```

The publish command:

- builds the image as `linux/amd64`;
- sends the registry password through stdin rather than process arguments;
- pushes the timestamped image;
- captures the registry's SHA-256 digest;
- logs out of ACR;
- writes the immutable `ALIBABA_FC_IMAGE=...@sha256:...` reference to `.env`.

## 6. Deploy or update Function Compute

Review the fully redacted FC3 request, then apply:

```bash
npm run deploy:plan
npm run deploy:fc
```

The deploy command uses the official FC3 TypeScript SDK. It creates or updates the function, waits until the function is active, and creates or updates the anonymous HTTP trigger. Qwen keys and the access token are redacted from plans and never printed from API responses.

Shared function defaults are:

- custom HTTP runtime on port `9000`;
- 0.5 vCPU, 1 GB memory, 300-second timeout, concurrency 1;
- outbound internet enabled for Qwen APIs;
- application-level access protection for paid AI endpoints.

The full container path additionally enables SLS request, instance, and LLM metrics; Tablestore metadata and agent evidence; private OSS product photos; and an attached RAM execution role with temporary credentials.

The returned `publicUrl` is the base endpoint. The private judge link is:

```text
<publicUrl>/?access=<the QUOTEX_ACCESS_TOKEN value in .env>
```

After the first successful visit, the browser uses the secure cookie and the clean base URL.

## 7. Cloud smoke test

Verify `GET /api/health`. For the durable path, create, retrieve, stream the photo for, and delete one realistic listing through the protected API. Durable cloud health must show:

```json
{
  "ok": true,
  "storage": {
    "provider": "alibaba",
    "database": "Alibaba Tablestore",
    "objectStorage": "Alibaba OSS",
    "durable": true
  },
  "runtime": {
    "provider": "Alibaba Cloud Function Compute",
    "accessProtected": true
  }
}
```

The lightweight judge path instead reports `provider: "memory"` and `durable: false`; that is expected and must remain visible in the evidence.

## 8. Optional extra proof

Capture one continuous, short recording showing:

1. the Alibaba Cloud console with the Function Compute function name and region;
2. the selected ZIP artifact digest or ACR image/version;
3. environment variable **names only**—never reveal values;
4. the function endpoint loading QuoteX;
5. `/api/health` returning `ok: true` and `configured: true`;
6. a live RFQ run whose **Agent evidence** shows model, endpoint host, planner turns, six skills, latency, usage, digest, and blocked send gate;
7. Function Compute invocation logs for the same run.

Before recording, close unrelated tabs, hide account IDs if desired, and verify no secret value appears in console or logs.

## 9. Submission evidence block

The repository code link is the required proof artifact. The separate runtime fields now contain verified values:

```text
Required Alibaba Cloud deployment code proof:
https://github.com/mongonsh/QuoteX/blob/main/server/alibaba-fc-deployment.ts

Additional Function Compute runtime evidence, when available:
Live application: https://quotex-utopilot-vybltedhtp.ap-northeast-1.fcapp.run
Cloud console proof: <real video URL>
Artifact version/digest: ZIP SHA-256 7884c54f400f3e8d5eead76c34caaf50039f5dce47a8ab3754ad45524c5ec75d
Health check captured: 2026-07-20T18:17:03.303Z
Machine-readable evidence:
https://github.com/mongonsh/QuoteX/blob/main/docs/alibaba-deployment-evidence.json
```

The three-minute product demo remains a separate submission requirement. Do not submit placeholders as evidence.

## Cleanup after judging

Disable the temporary RAM AccessKey immediately after deployment. When judging is complete, delete the Function Compute function and trigger, ACR image and repository, OSS objects and bucket, Tablestore tables and instance, SLS Logstore and project, and the QuoteX RAM role and custom policy. Trial quotas do not guarantee that usage above the covered dimensions is free.
