# QuoteX judge demo — 3 minutes

## 0:00–0:20 — Problem and promise

“Export sales teams receive messy messages, not clean order forms. A buyer may write in Japanese, say ‘the same board,’ add a deadline, and assume old payment terms. QuoteX turns that ambiguity into a governed quote, but it never sends a commercial offer without a human.”

Show the hero and four-stage workflow.

## 0:20–1:05 — Live autonomy

1. Select **Mori Lighting — 500 boards**.
2. Confirm **Live Qwen** and the configured model status.
3. Click **Run Autopilot**.
4. Narrate the true boundary labels:
   - Qwen Cloud extracts the Japanese RFQ.
   - Verified tools retrieve memory, match the catalog, price the offer, and score freight.
   - The policy stage stops at the human gate.
5. Point to the execution-proof cards: model call, autonomous stages, memory leverage, six guardrails, audit ID.

Key line: “I am not using an LLM for arithmetic or policy. Qwen handles ambiguity; deterministic tools handle money and control.”

## 1:05–1:35 — Inspectability and human control

1. Open **Quote** and show landed total, margin, freight, and terms.
2. Open **Qwen Trace** and show model, endpoint host, latency, tokens, sanitized prompt, and normalized response.
3. Return to **Workbench** and approve.

Key line: “There is deliberately no autonomous send endpoint. Approval is the only event that can write experience.”

## 1:35–2:05 — Memory that changes the next run

1. Click **Test the next RFQ with this memory**.
2. Run the 800-unit follow-up.
3. Show the new approved-outcome memory and the memory-impact card.
4. Open **Memory** to show evidence, confidence, retention policy, and the clear control.

Key line: “This is cross-session memory, not a static timeline animation. Refresh the browser and the approved outcome remains available.”

## 2:05–2:30 — Multimodal Qwen

1. Open **Creative**.
2. Upload a product image.
3. Generate the campaign creative.
4. Show Qwen's brief and Qwen-Image Edit result or the clearly labeled fallback.

## 2:30–3:00 — Production readiness

Show the architecture diagram and Alibaba Cloud proof recording.

“QuoteX ships as an AMD64 container for Function Compute, listens on the required port, exposes a secret-safe health check, has prompt-injection defenses and security headers, and degrades visibly. The result is a product teams can trust, not a toy agent that hides its failures.”

End on the approved quote and audit ID.

## Demo safety checklist

- Run `npm test` immediately before recording.
- Verify `/api/health` says `configured: true`.
- Run the exact Mori flow once to warm the service.
- Use a non-sensitive product image under 5 MB.
- Keep **Resilient demo** available, but do not present it as live Qwen.
- Never show `.env`, API key values, browser storage, or cloud credentials.
