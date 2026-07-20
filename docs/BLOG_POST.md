# Why our Qwen agent is not allowed to set a price

Cross-border sales looks simple from the outside: a buyer asks for a product, and a seller replies with a quote.

The actual workflow is a chain of small, risky decisions. What product did the buyer mean? Is it in stock? Which customer terms still apply? Can freight meet the deadline? Does the price protect margin? Which claims need a person to approve?

A language model is excellent at understanding the messy request. It should not become the source of truth for inventory, money, or an irreversible send action.

That principle shaped QuoteX, our Track 4 Autopilot Agent for the Global AI Hackathon Series with Qwen Cloud:

> Qwen plans. Verified tools decide facts. A human approves the commercial action.

## The request is not a form

Our main demo starts with a realistic buyer message:

> Please quote 500 Grade-A Mongolian cashmere scarves for our Berlin stores in charcoal, forest green, and natural oat. Use plastic-free paper sleeves, deliver DDP Berlin within 21 days, keep freight under USD 1,000, and use our usual payment terms.

That short paragraph contains product identity, quantity, destination, delivery pressure, a conditional freight preference, and two references to customer history.

A single extraction call can turn it into JSON. That is useful, but it is not an agent workflow. It also does not prove that the resulting SKU, stock, price, freight, or approval state came from a trusted source.

## A bounded Qwen planner

QuoteX gives Qwen3.7 six strict function tools:

1. `structure_request`
2. `retrieve_customer_memory`
3. `match_product_catalog`
4. `select_shipping_route`
5. `calculate_margin_safe_quote`
6. `enforce_approval_policy`

The server exposes only tools that remain incomplete. Qwen may call independent tools in parallel, and the planner stops after four turns. If a tool is omitted, malformed, or interrupted by a provider failure, the same verified implementation completes it and labels the run as guarded recovery.

The distinction between choosing a tool and owning its result is central.

Qwen can say that the catalog should be searched for an Aurora controller. It cannot create a SKU. It can request a quote for 500 units. It cannot write the unit price. It can ask for customer memory. It cannot make an unrelated preference relevant. It can acknowledge the approval policy. It cannot approve or send.

## Deterministic commercial authority

The TypeScript domain layer owns the commercial truth:

- Catalog matching combines aliases, product terms, explicit intent, and phrase polarity.
- Memory retrieval is customer-scoped and bound to the original buyer message.
- Freight is scored from market support, deadline, cost, reliability, and relevant approved preferences.
- Pricing recomputes discount, unit price, goods total, freight, landed total, gross profit, and margin.
- Policy checks ambiguity, stock, margin, provenance, payment terms, and delivery feasibility.
- Every result ends at `human-review-required`.

The phrase-polarity matcher matters more than it may sound. A hotel buyer wrote:

> We need the controller, not the power brick, unless the 60W driver is required for install.

A bag-of-words matcher can overvalue the repeated driver phrase. QuoteX penalizes negated and conditional alternatives, selects the controller, and still escalates the remaining ambiguity.

Unknown products are also explicit. The trusted SKU becomes `CUSTOM-REVIEW`, never a plausible-looking invention.

## Evidence is a product feature

Most agent demos end with an answer. QuoteX ends with an answer and an audit trail.

The interface shows:

- whether Qwen was live or guarded recovery ran;
- every requested skill and its source;
- the deterministic output of each skill;
- planner turns, latency, and provider token usage;
- the selected SKU, route, quote arithmetic, and risks;
- a SHA-256 digest over the decision evidence;
- the blocked send gate.

The last 200 sanitized runs are persisted in SQLite. Raw credentials are never stored.

This makes a subtle failure visible. A successful quote produced during a provider outage is still useful, but it must not be presented as live Qwen reasoning.

## We tested the architecture, not just the code path

We wanted to answer a harder question: does this architecture actually outperform asking Qwen to make the final decision in one prompt?

Our evaluator gives both approaches the same Qwen3.7 model and the same trusted customer, catalog, memory, freight, pricing, and policy context.

The direct baseline receives the rules and returns final JSON. QuoteX uses Qwen to plan typed tools while verified code owns the output.

We run six adversarial cases:

- a buyer instructs the agent to use a one-dollar price and send immediately;
- a desired product appears beside a negated alternative;
- requested quantity exceeds stock;
- the product is not in the catalog;
- the deadline has no operational buffer;
- a repeat buyer refers to previous decisions.

Each case scores seven facts: SKU, quantity, unit price, freight, total integrity, risk coverage, and human approval.

Our latest live result with `qwen3.7-plus`:

| Architecture | Result |
| --- | ---: |
| QuoteX governed Qwen tool agent | 42/42, 100% |
| Direct single-prompt Qwen baseline | 28/42, 66.7% |
| Difference | +33.3 percentage points |

All six governed cases used live Qwen. The direct baseline also returned all six responses, so the difference was not caused by provider errors.

The direct model did many things well. It handled negation and the tight deadline correctly. Its failures were concentrated around exact price authority, totals, and the unknown-product route. That is precisely where executable tools are more valuable than another instruction in a prompt.

## The evaluator found bugs in QuoteX

The strongest reason to keep the evaluator is that it found failures in our own architecture.

First, the deterministic parser read `1,500` as `1`. The regex supported six digits but not grouped commas. We fixed grouped-number parsing and added a regression test.

Second, Qwen's proposed memory-search wording could broaden relevance. A planner could mention payment terms in its retrieval query even when the buyer had not, causing an extra discount. We changed the boundary: Qwen can request memory, but only the original buyer message can establish relevance. Preference boosts now also require evidence overlap.

After those fixes, the live governed result moved from 40/42 to 42/42.

That progression is more meaningful than presenting a perfect number without history. The evaluation is doing engineering work.

## Multimodal, but connected to one goal

QuoteX also uses Qwen Cloud across the surrounding workflow:

- Qwen ASR transcribes seller and customer speech.
- Qwen structured conversation fills an editable product intake.
- Qwen vision grounds a campaign brief in the uploaded photo.
- Wan/Qwen Image creates a commercial product edit.
- HappyHorse animates the approved campaign frame.
- Qwen Voice Design and Qwen TTS provide a consistent customer-assistant voice.

These are not separate demos. One verified product record and one governed offer feed the customer answer, campaign asset, product video, and validation-first Amazon, eBay, and Alibaba.com drafts.

Publishing remains disabled until OAuth and human approval exist.

## Alibaba Cloud deployment as code

The repository includes an executable Alibaba Cloud Function Compute 3.0 deployment path.

`npm run deploy:plan` uses the official `@alicloud/fc20230330` SDK model to build and validate a Custom Container `CreateFunction` request. It shows `POST /2023-03-30/functions`, port 9000, CPU, memory, timeout, concurrency, SLS metrics, and environment names while redacting Qwen keys.

`npm run deploy:fc` is the explicit apply command. It uses Alibaba Cloud's default credential chain and prints only safe deployment identifiers.

Inside Function Compute, QuoteX reads request ID, function name, and region context headers and writes structured logs for Simple Log Service. It never logs temporary credential headers.

## Reproduce it

```bash
npm install
npm test
npm run benchmark
npm run evaluate
npm run deploy:plan
```

With a Qwen Cloud key:

```bash
npm run evaluate -- --live
```

The deterministic benchmark, adversarial protocol, machine-readable result, architecture diagram, deployment code, and three-minute demo script are all in the public repository.

## The autonomy we want

Useful autonomy is not the absence of people. It is the removal of repetitive coordination before the smallest meaningful human decision.

For QuoteX, that means Qwen can understand ambiguity and orchestrate work at machine speed. Verified tools remain responsible for facts and money. A person remains responsible for the promise made to a customer.

That is not less agentic. It is the form of agency we would trust in a real business.
