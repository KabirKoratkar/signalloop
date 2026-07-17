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

The current repository ships deterministic demo adapters so it works without
event credentials. The interfaces in `lib/signalloop/adapters.ts` are the live
integration seams; sponsor credentials can be added without changing the UI or
loop contract.

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
- `app/api/demo-loop/route.ts` — deterministic loop endpoint
- `lib/signalloop/loop.ts` — event contract, evidence, metrics, and guardrails
- `lib/signalloop/adapters.ts` — sponsor integration boundaries
- `tests/rendered-html.test.mjs` — product and safety assertions
