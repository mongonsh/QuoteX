# Alibaba Cloud deployment and proof

The hackathon requires a separate recording that proves the backend is running on Alibaba Cloud. This file makes the deployment repeatable; it does not claim that a recording exists until you capture and link the real evidence.

## Container contract

QuoteX is prepared for an Alibaba Cloud Function Compute custom container:

- listens on `0.0.0.0:9000` by default;
- compiles with `npm run build` and starts with `node dist/tools/serve.js`;
- provides `GET /api/health`;
- has no runtime package installation step;
- keeps Qwen credentials in environment variables;
- can be built as `linux/amd64`, the architecture required by Function Compute.

Alibaba Cloud's official documentation requires custom-container HTTP servers to listen on `0.0.0.0:CAPort` and notes that ARM-based development machines must build for `linux/amd64`:

- [Function Compute custom container overview](https://www.alibabacloud.com/help/en/functioncompute/fc/user-guide/custom-container/)
- [Create a custom container function](https://www.alibabacloud.com/help/en/functioncompute/fc/create-a-custom-container-function-in-a-container-runtime)

## 1. Build and verify locally

```bash
docker build --platform linux/amd64 -t quotex:latest .
docker run --rm -p 9000:9000 --env-file .env quotex:latest
curl http://127.0.0.1:9000/api/health
```

Expected health shape:

```json
{
  "ok": true,
  "qwen": {
    "configured": true,
    "model": "qwen3.6-flash"
  }
}
```

The real response includes model and endpoint metadata but never the API key.

## 2. Push to Alibaba Cloud Container Registry

Create an ACR repository in the same Alibaba Cloud account and region as the Function Compute function. Follow the login and push commands shown by ACR for your repository.

```bash
docker tag quotex:latest <acr-registry>/<namespace>/quotex:<version>
docker push <acr-registry>/<namespace>/quotex:<version>
```

Use an immutable version tag or digest for the judged deployment.

## 3. Create the Function Compute function

In Function Compute:

1. Create a Web/HTTP function using the custom container image from ACR.
2. Set the listening port to `9000`.
3. Keep the image's default command, which runs the compiled `dist/tools/serve.js` entrypoint.
4. Add `QWEN_API_KEY`, model IDs, and optional image-workspace variables as encrypted environment settings.
5. Set memory to at least 512 MB and request timeout to at least 60 seconds for image generation.
6. Publish the HTTP endpoint and call `/api/health`.
7. Run one live RFQ and confirm the Qwen Trace shows `live`.

## 4. Record the required proof

Capture one continuous, short recording showing:

1. the Alibaba Cloud console with the Function Compute function name and region;
2. the selected ACR image/version;
3. environment variable **names only**—never reveal values;
4. the function endpoint loading QuoteX;
5. `/api/health` returning `ok: true` and `configured: true`;
6. a live RFQ run whose Qwen Trace shows model, endpoint host, latency, and token usage;
7. Function Compute invocation logs for the same run.

Before recording, close unrelated tabs, hide account IDs if desired, and verify no secret value appears in console or logs.

## 5. Submission evidence block

Add the real URLs after deployment:

```text
Live application: <public Function Compute URL>
Deployment proof video: <video URL>
Image version/digest: <immutable ACR reference>
Health check captured: <UTC timestamp>
```

Do not submit placeholders as proof.
