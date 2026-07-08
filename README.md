# QuotePilot

QuotePilot is a Qwen Cloud hackathon project for **Track 4: Autopilot Agent**.
It turns messy cross-border RFQs into human-approved quotes, with persistent
customer memory as the visible differentiator.

## Core Capabilities

- Voice-to-text RFQ intake in the buyer message editor.
- Media upload for product photos attached to a quote workflow.
- AI marketing studio that turns an uploaded product image and quote context
  into a downloadable campaign image.
- Human approval checkpoint before any commercial offer is sent.
- Persistent customer memory that changes future pricing, shipping, and risk
  decisions.

## Run

```bash
npm run dev
```

Then open the printed local URL.

No install step is required. The app is dependency-free and uses ES modules.

## Qwen Setup

Create `.env`:

```bash
QWEN_API_KEY=your_key_here
QWEN_IMAGE_API_KEY=your_image_region_key_here
QWEN_MODEL=qwen3.6-flash
QWEN_MARKETING_MODEL=qwen3.6-flash
QWEN_IMAGE_MODEL=qwen-image-2.0-pro
```

Optional overrides:

```bash
QWEN_BASE_URL=https://your_workspace_id.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1
QWEN_IMAGE_BASE_URL=https://your_image_workspace_id.ap-southeast-1.maas.aliyuncs.com/api/v1
# Or: QWEN_IMAGE_BASE_URL=https://your_image_workspace_id.cn-beijing.maas.aliyuncs.com/api/v1
QWEN_WORKSPACE_ID=your_workspace_id
QWEN_REGION=ap-northeast-1
```

`QWEN_BASE_URL` wins when set. If only `QWEN_WORKSPACE_ID` is set, the server builds
the workspace-specific Model Studio endpoint.

Qwen-Image Edit is region-specific. Alibaba's Qwen-Image Edit docs list
Singapore and Beijing HTTP endpoints, and their API keys cannot be used
interchangeably. If your text model uses a Tokyo workspace, create or use a
Singapore/Beijing image workspace key and set `QWEN_IMAGE_API_KEY` plus
`QWEN_IMAGE_BASE_URL`.

Check the key, endpoint, and configured model without printing the secret:

```bash
npm run probe:qwen
```

Check the Qwen-Image Edit endpoint and model without printing the secret:

```bash
npm run probe:qwen-image
```

Find the first recognized model ID for the workspace:

```bash
npm run find:qwen-model
```

If Alibaba Cloud returns `403 free quota has been exhausted`, the key and endpoint
are working but the Model Studio account needs payment information or the "free
tier only" setting must be disabled in the console before live Qwen parsing can
run. The app keeps a deterministic fallback parser so the demo remains usable.

The marketing studio calls Qwen-Image Edit (`qwen-image-2.0-pro`) with the
uploaded product image and a campaign prompt. On success, it displays the PNG
returned by Model Studio. If Qwen image editing is unavailable, it falls back to
a deterministic edited SVG preview so the demo remains usable.

## Test

```bash
npm test
```

## Demo Flow

1. Select the Mori Lighting RFQ.
2. Run the autopilot.
3. Watch the agent timeline parse the request, recall memory, match product,
   price the quote, and stop at the human approval checkpoint.
4. Open Creative, upload a product photo, and generate a quote campaign image.
5. Approve the quote.
6. Select the second Mori RFQ and run again. The memory panel shows how customer
   behavior influences the next quote.

## Qwen Integration Boundary

The browser calls `/api/parse-rfq`. The server reads `.env` and calls Qwen through
the OpenAI-compatible chat completions API. If Qwen fails, the app keeps the
deterministic parser path so the live demo does not break.
