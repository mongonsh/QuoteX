# QuoteX judge demo - 1 minute 42 seconds

The story is simple: Qwen plans the work, verified tools protect commercial truth, and a person controls the irreversible action.

The primary submission artifact is the motion-led [cinematic judge film](CINEMATIC_DEMO.md).
This document keeps the detailed narration and evidence checklist used by both the primary film
and the slower browser-recording backup.

## Final artifact

- Local upload-ready file: `.runtime/demo/QuoteX-motion-demo.mp4`
- Duration: `1:42.50`
- Video: H.264 High, 1920 x 1080, 30 fps, standard-range BT.709 `yuv420p`
- Audio: AAC stereo, 48 kHz, soft CosyVoice narration, provided music, and synchronized effects; `-15.0 LUFS` integrated / `-1.5 dBFS` true peak
- File size: 110,592,401 bytes
- SHA-256: `77c9d112ef4a20a2734e35957ebf67134f04088e209cb6c63a507e3a8d60ee07`
- Technical backup: `.runtime/demo/QuoteX-demo-final.mp4`
- Public URL: replace `<DEMO_VIDEO_URL>` in `docs/DEVPOST_SUBMISSION.md` after upload

The MP4 is ignored by Git because it is a local submission artifact. The source repository contains the script, architecture, screenshots, evaluator, and all implementation evidence.

## Time-coded shot list

### 0:00-0:14 - Real buyer input

Show a Berlin retailer requesting 500 Grade-A Mongolian cashmere scarves. The request combines
three colors, plastic-free packaging, a freight ceiling, a 21-day target, and origin documents.
The visible journey is **Understand, Verify, Approve, Prepare**.

Narration establishes the pain: cross-border work begins with messy voice notes, product photos,
and ambiguous messages rather than a complete form.

### 0:14-0:32 - Governed Qwen agent

Open **Agent evidence** and show the six typed skills. Each row exposes whether Qwen selected it, the trusted result, and execution time.

Key claim: Qwen may propose a tool call, but it cannot invent a SKU, set the commercial price, or send an offer.

### 0:32-0:44 - Measurable evidence

Show the trust boundary and the checked-in adversarial result:

- Governed Qwen tool agent: `42 / 42`
- Direct one-prompt Qwen baseline: `28 / 42`
- Difference: `+33.3` percentage points

These are six declared adversarial fixtures, not a production business KPI.

### 0:44-0:54 - Human checkpoint

Open **Offer** and show the recomputed `$33,630` landed total, DHL Economy Select route, Net 30
terms, 45% gross margin, and pending approval. Nothing has been sent or published.

### 0:54-1:04 - AI campaign asset

Open **Campaign** and show the cashmere source photo beside the generated campaign image. The
image was produced by the live configured Qwen/Wan route during recording preflight.

### 1:04-1:13 - Marketplace adapters

Show the Amazon, eBay, and Alibaba.com drafts. They are validation-first payloads with platform-specific fields and warnings. They are not published listings.

### 1:13-1:23 - Grounded voice assistant

Show the prepared “When would 500 scarves arrive in Berlin?” exchange. The activity rail visibly
confirms:

- Qwen3-ASR-Flash input route
- Qwen3.7 grounded answer
- CosyVoice output ready
- Human checkpoint still locked

### 1:23-1:32 - Graceful degradation

Switch to **Resilient demo**. The same six trusted skills run with zero model turns, every completion is labeled as a guardrail action, and the send gate remains closed.

### 1:32-1:42 - Architecture close

End on the architecture diagram: validated input, bounded Qwen planner, six commerce skills, SQLite evidence, risk policy, human approval, and downstream media or marketplace drafts.

Final line:

“Qwen plans. Verified tools decide facts. A human controls the commercial action.”

## Narration

The primary film uses nine concise, scene-timed passages. The exact text, starts, voice
configuration, timing guard, WAV normalization, and mix are versioned in
`demo/motion/generate-narration.py`.

The closing line is:

> Qwen plans, verified tools decide, and a human controls the action.

## Final QA

- Live agent, campaign image, customer answer, and designed voice all passed recording preflight.
- No page exceptions or failed application requests occurred in the visible take.
- The only browser console message was a harmless `/favicon.ico` 404 after opening the final SVG.
- Qwen streaming WAV sentinel lengths are normalized to actual RIFF/data sizes before browser playback.
- Signed audio downloads retry only transient network, timeout, rate-limit, and 5xx failures.
- Frame sampling confirms the request, tool trace, score, offer, campaign, marketplace, voice, fallback, and architecture scenes.
- Audio measures `-14.9 LUFS` integrated and `-1.4 dBFS` true peak.
- No freeze interval persisted for 0.8 seconds and no black frame persisted for 0.5 seconds.
- The delivery file is tagged standard-range BT.709 and decodes end to end without errors.

## Upload checklist

1. Upload `.runtime/demo/QuoteX-motion-demo.mp4` to YouTube as **Unlisted** or to another Devpost-supported public video host.
2. Use the title `QuoteX - Governed Qwen Commerce Agent | 102-second Demo`.
3. Confirm playback in a signed-out/private browser window.
4. Replace `<DEMO_VIDEO_URL>` in `docs/DEVPOST_SUBMISSION.md`.
5. Run `npm run verify:submission`; all 12 checks must pass.

## Recording rules

- Never show an API key, account ID, environment value, or private endpoint.
- Use only English example data.
- Do not call marketplace drafts published listings.
- Do not call fixture benchmark numbers production outcomes or human-time savings.
- Do not present **Resilient demo** as **Live Qwen**.
