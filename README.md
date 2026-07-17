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

## Sponsor-ready capability chain

| Boundary | Sponsor | Job in the loop |
| --- | --- | --- |
| `SignalSource` | Nexla | Normalize CRM, reply, and experiment outcomes into observations. |
| `Strategist` | AWS Bedrock | Diagnose evidence and return the next constrained hypothesis. |
| `CapabilityGateway` | Zero | Discover and invoke enrichment, verification, and outreach capabilities. |
| `ProtectedAction` | Pomerium | Enforce identity-aware policy before any side effect. |

The Bedrock strategist is live-ready: the server sends the completed campaign
evidence to Amazon Nova through Bedrock's Converse API, validates the returned
hypothesis, and injects it into the replay. When no Bedrock API key is present,
the same endpoint returns a labeled deterministic fallback, so the demo never
pretends a sponsor call happened and never fails on stage. The remaining
sponsor boundaries are still deterministic integration seams.

## Enable AWS Bedrock

For a hackathon demo, generate an Amazon Bedrock API key in the AWS console,
then create a local environment file:

```bash
cp .env.example .env.local
```

Put the key after `AWS_BEARER_TOKEN_BEDROCK=` in `.env.local`, restart the app,
and run the learning loop. The status at the top of the dashboard will switch
from **DEMO FALLBACK** to **LIVE** only after Bedrock returns a valid strategy.

The default model is `us.amazon.nova-2-lite-v1:0` in `us-east-1`. Both can be
overridden in `.env.local`. Credentials stay server-side and `.env.local` is
ignored by Git. The Bedrock step only proposes strategy; it cannot send email
or call an action tool.

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
- `lib/signalloop/bedrock.ts` — server-only Bedrock Converse adapter and validation
- `lib/signalloop/loop.ts` — event contract, evidence, metrics, and guardrails
- `lib/signalloop/adapters.ts` — sponsor integration boundaries
- `tests/rendered-html.test.mjs` — product and safety assertions
