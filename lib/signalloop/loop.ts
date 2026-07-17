export type LoopPhase =
  | "observe"
  | "reason"
  | "plan"
  | "guard"
  | "act"
  | "verify";

export type EventKind = "info" | "blocked" | "correction" | "success";
export type Provider =
  | "Nexla"
  | "AWS Bedrock"
  | "Zero"
  | "Pomerium"
  | "SignalLoop";

export interface MetricSnapshot {
  latestPositiveRate: number;
  meetings: number;
  eligibleContacts: number;
  policyBlocks: number;
  reputationScore: number;
}

export interface StrategySnapshot {
  audience: string;
  angle: string;
  proof: string;
  confidence: number;
}

export type StrategyFallbackCode =
  | "not-requested"
  | "forced-demo"
  | "missing-api-key"
  | "disabled"
  | "timeout"
  | "service-error"
  | "invalid-response";

export interface StrategyEngineStatus {
  provider: "AWS Bedrock";
  mode: "live" | "deterministic-fallback";
  modelId: string;
  region: string;
  latencyMs: number;
  stopReason?: string;
  fallbackCode?: StrategyFallbackCode;
  inputTokens?: number;
  outputTokens?: number;
}

export interface StrategyProposal {
  diagnosis: string;
  rationale: string;
  evidence: string;
  strategy: StrategySnapshot;
}

export interface StrategyEngineResult {
  proposal: StrategyProposal;
  status: StrategyEngineStatus;
}

export interface LoopEvent {
  id: string;
  phase: LoopPhase;
  provider: Provider;
  kind: EventKind;
  title: string;
  detail: string;
  evidence?: string;
  metrics?: MetricSnapshot;
  strategy?: StrategySnapshot;
}

export interface ExperimentResult {
  id: string;
  day: string;
  audience: string;
  message: string;
  sent: number;
  positive: number;
  meetings: number;
  rate: number;
  verdict: "Rejected" | "Promising" | "Winner" | "Retired";
  revealAfter: number;
}

export interface LoopRun {
  runId: string;
  scenario: "pivot-to-fintech";
  product: { name: string; description: string; goal: string };
  strategyEngine: StrategyEngineStatus;
  before: { metrics: MetricSnapshot; strategy: StrategySnapshot };
  events: LoopEvent[];
  experiments: ExperimentResult[];
  guardrails: {
    maxDailySends: number;
    maxDailyGrowth: number;
    verifiedEmailsOnly: boolean;
    demoMode: boolean;
  };
}

const baselineMetrics: MetricSnapshot = {
  latestPositiveRate: 0,
  meetings: 0,
  eligibleContacts: 22,
  policyBlocks: 0,
  reputationScore: 98,
};

const initialStrategy: StrategySnapshot = {
  audience: "VPs of Engineering",
  angle: "Reduce AI infrastructure cost",
  proof: "30% lower inference spend",
  confidence: 31,
};

const deterministicProposal: StrategyProposal = {
  diagnosis:
    "Cost is not urgent. Audit evidence, access reviews, and SOC 2 appear repeatedly in replies and referral language.",
  rationale:
    "Test security leaders with an outcome-led promise: produce audit evidence for every agent action.",
  evidence: "3 security phrases across 5 substantive replies",
  strategy: {
    audience: "Security leaders",
    angle: "Audit-ready AI agent access",
    proof: "Evidence for every tool action",
    confidence: 61,
  },
};

const defaultStrategyEngine: StrategyEngineStatus = {
  provider: "AWS Bedrock",
  mode: "deterministic-fallback",
  modelId: "us.amazon.nova-2-lite-v1:0",
  region: "us-east-1",
  latencyMs: 0,
  fallbackCode: "not-requested",
};

export function createDemoRun(strategyResult?: StrategyEngineResult): LoopRun {
  const proposal = strategyResult?.proposal ?? deterministicProposal;
  const strategyEngine = strategyResult?.status ?? defaultStrategyEngine;

  return {
    runId: "tracelayer-loop-2026-07-14",
    scenario: "pivot-to-fintech",
    product: {
      name: "TraceLayer",
      description: "Audit logs and access controls for production AI agents.",
      goal: "Find a repeatable message that books qualified discovery calls.",
    },
    strategyEngine,
    before: { metrics: baselineMetrics, strategy: initialStrategy },
    events: [
      {
        id: "evt-observe-day-one",
        phase: "observe",
        provider: "Nexla",
        kind: "info",
        title: "Day 1 missed the mark",
        detail:
          "22 verified engineering leaders received the cost-control message. No positive replies and no meetings.",
        evidence:
          "“Spend isn’t my issue. Security needs an audit trail before our SOC 2 review.”",
        metrics: baselineMetrics,
        strategy: initialStrategy,
      },
      {
        id: "evt-reason-pain",
        phase: "reason",
        provider: "AWS Bedrock",
        kind: "correction",
        title: "The objection contains the signal",
        detail: proposal.diagnosis,
        evidence: proposal.evidence,
      },
      {
        id: "evt-plan-pivot",
        phase: "plan",
        provider: "AWS Bedrock",
        kind: "correction",
        title: "Pivot buyer and message",
        detail: proposal.rationale,
        strategy: proposal.strategy,
      },
      {
        id: "evt-act-enrich",
        phase: "act",
        provider: "Zero",
        kind: "info",
        title: "Build a verified test cohort",
        detail:
          "Discovered enrichment and verification capabilities, then selected 24 security leaders across fintech, SaaS, and healthcare.",
        evidence: "24 verified · 0 suppressed · 3 industries",
        metrics: {
          latestPositiveRate: 25,
          meetings: 3,
          eligibleContacts: 46,
          policyBlocks: 0,
          reputationScore: 98,
        },
      },
      {
        id: "evt-verify-segment",
        phase: "verify",
        provider: "Nexla",
        kind: "success",
        title: "Fintech security breaks away",
        detail:
          "The new message earns 6 positive replies and 3 meetings. Five of the six positives come from fintech security teams.",
        evidence: "Fintech 42% · SaaS 17% · Healthcare 0%",
        strategy: {
          audience: "Fintech security leaders",
          angle: "Audit-ready AI agent access",
          proof: "Evidence for every tool action",
          confidence: 78,
        },
      },
      {
        id: "evt-guard-scale",
        phase: "guard",
        provider: "Pomerium",
        kind: "blocked",
        title: "Unsafe scale-up denied",
        detail:
          "SignalLoop requested a 240-contact send. Policy blocked it for exceeding both the 50/day limit and the 2× growth rule.",
        evidence: "0 messages sent · blast radius contained",
        metrics: {
          latestPositiveRate: 25,
          meetings: 3,
          eligibleContacts: 46,
          policyBlocks: 1,
          reputationScore: 98,
        },
      },
      {
        id: "evt-reason-replan",
        phase: "reason",
        provider: "AWS Bedrock",
        kind: "correction",
        title: "Replan inside the boundary",
        detail:
          "Reduce the next batch to 40 verified fintech security leaders and split-test outcome-led versus fear-led framing.",
        evidence: "20 contacts per variant · below 50/day cap",
        strategy: {
          audience: "Fintech security leaders",
          angle: "Outcome-led vs. fear-led",
          proof: "Audit evidence export",
          confidence: 82,
        },
      },
      {
        id: "evt-act-split-test",
        phase: "act",
        provider: "Zero",
        kind: "info",
        title: "Launch the safe split-test",
        detail:
          "Excluded four unverified and three suppressed contacts, then launched two controlled 20-contact variants.",
        evidence: "40 sent · 100% verified · suppression list honored",
        metrics: {
          latestPositiveRate: 35,
          meetings: 8,
          eligibleContacts: 86,
          policyBlocks: 1,
          reputationScore: 98,
        },
      },
      {
        id: "evt-observe-winner",
        phase: "observe",
        provider: "Nexla",
        kind: "success",
        title: "Outcome-led framing wins",
        detail:
          "Audit evidence produced 7 positive replies and 4 meetings versus 3 positives and 1 meeting for the fear-led variant.",
        evidence: "35% vs. 15% positive reply rate",
      },
      {
        id: "evt-verify-playbook",
        phase: "verify",
        provider: "SignalLoop",
        kind: "success",
        title: "A repeatable playbook emerges",
        detail:
          "Keep the fintech security segment, lead with audit evidence, and run another capped validation batch tomorrow.",
        evidence: "86 total sends · 16 positive replies · 8 meetings",
        metrics: {
          latestPositiveRate: 35,
          meetings: 8,
          eligibleContacts: 86,
          policyBlocks: 1,
          reputationScore: 98,
        },
        strategy: {
          audience: "Fintech security leaders",
          angle: "Audit evidence for every agent action",
          proof: "Exportable access history",
          confidence: 91,
        },
      },
    ],
    experiments: [
      {
        id: "day-1",
        day: "DAY 01",
        audience: "Engineering leaders",
        message: "Reduce AI infrastructure cost",
        sent: 22,
        positive: 0,
        meetings: 0,
        rate: 0,
        verdict: "Rejected",
        revealAfter: 0,
      },
      {
        id: "day-2",
        day: "DAY 02",
        audience: "Security leaders",
        message: "Audit-ready agent access",
        sent: 24,
        positive: 6,
        meetings: 3,
        rate: 25,
        verdict: "Promising",
        revealAfter: 5,
      },
      {
        id: "day-3a",
        day: "DAY 03 · A",
        audience: "Fintech security",
        message: "Evidence for every agent action",
        sent: 20,
        positive: 7,
        meetings: 4,
        rate: 35,
        verdict: "Winner",
        revealAfter: 9,
      },
      {
        id: "day-3b",
        day: "DAY 03 · B",
        audience: "Fintech security",
        message: "Could your agent pass review?",
        sent: 20,
        positive: 3,
        meetings: 1,
        rate: 15,
        verdict: "Retired",
        revealAfter: 9,
      },
    ],
    guardrails: {
      maxDailySends: 50,
      maxDailyGrowth: 2,
      verifiedEmailsOnly: true,
      demoMode: true,
    },
  };
}
