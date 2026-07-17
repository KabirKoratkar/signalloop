# SignalLoop

SignalLoop is an autonomous outbound experimentation agent. It observes reply
signals, diagnoses why a campaign is underperforming, proposes the next small
test, acts inside hard policy limits, and turns the result into tomorrow's
playbook.

The hackathon demo replays three days of outbound for a fictional product,
TraceLayer. A weak cost-saving pitch gets zero positive replies; SignalLoop
finds an audit-readiness signal, pivots to fintech security leaders, blocks an
unsafe 240-contact scale-up, replans a 40-contact split test, and selects a
directional winner.

## Demo guarantees

- The replay is deterministic and uses fictional data.
- Demo mode never sends real email.
- Strategy changes are tied to positive replies and meetings, not opens.
- A denied action becomes a new observation and triggers replanning.
- Daily volume stays below 50, only verified contacts are eligible, and the
  sender reputation score never decreases.

## Integration status

| Boundary | Provider | What is real today |
| --- | --- | --- |
| `Strategist` | OpenAI | Responses API adapter is wired and validated; the current project returns `billing_not_active`, so the app labels and uses its fallback. |
| `SignalSource` | Nexla | Campaign CSV and SQL schema are prepared; the runtime connector is not wired yet. |
| `CapabilityGateway` | Zero | Live public search and capability inspection on every normal run; the app does not execute or pay for capabilities. |
| `ProtectedAction` | Pomerium | A local tunnel was created; the policy decision in the replay is still modeled. |
| `Strategist` (optional) | AWS Bedrock | Converse adapter is implemented but inactive because AWS key provisioning failed. |

When explicitly enabled, the strategist sends the completed campaign evidence
to OpenAI's Responses API using `gpt-5.6-luna`, asks for a constrained
hypothesis through Structured Outputs, validates the result again in the
application, and injects it into the replay. When paid inference is disabled,
the key has no active billing, or the response fails validation, the endpoint
returns a clearly labeled deterministic fallback so the stage demo still works
without pretending a live call happened.

## Enable OpenAI

Create a local environment file:

```bash
cp .env.example .env.local
```

Put the key after `OPENAI_API_KEY=` and set `OPENAI_LIVE_ENABLED=true` in a
trusted local environment. Restart the app and run the learning loop. The
status at the top of the dashboard switches from **DEMO FALLBACK** to **LIVE**
only after OpenAI returns a valid, evidence-grounded strategy. The hosted demo
keeps paid secrets and paid inference disabled, and the API route enforces that
live inference can only run on a loopback host.

The default model is `gpt-5.6-luna` and can be overridden with `OPENAI_MODEL`.
Credentials stay server-side and `.env.local` is ignored by Git. The model step
only proposes strategy; it cannot send email or call an action tool.

## Zero capability gateway

SignalLoop calls Zero's public search and capability APIs from the server. A
normal learning-loop run searches the current index and inspects a healthy
email-verification capability without executing it, sharing contact data, or
spending funds. No wallet or Zero session is required.

A capped `$0.005 USDC` paid verification was successfully exercised during
development, but it is intentionally not exposed through the application
route. Before that becomes a product feature, it needs operator authentication,
a provider allowlist and preview, idempotency, and a persistent spend budget.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` and choose **Run learning loop**.

## Verify

```bash
npm run build
npm run lint
npm exec tsc -- --noEmit
npm test
```

The tests verify the rendered product shell, deterministic API contract,
deny-before-replan ordering, guardrail invariants, and removal of starter UI.

## Project map

- `app/signal-loop-dashboard.tsx` — interactive experiment replay
- `app/api/demo-loop/route.ts` — live-or-fallback loop endpoint
- `lib/signalloop/openai.ts` — active OpenAI Responses adapter and validation
- `lib/signalloop/bedrock.ts` — optional inactive Bedrock Converse adapter
- `lib/signalloop/zero.ts` — public, read-only Zero capability discovery
- `lib/signalloop/loop.ts` — event contract, evidence, metrics, and guardrails
- `lib/signalloop/adapters.ts` — provider integration boundaries and readiness
- `tests/rendered-html.test.mjs` — product and safety assertions
