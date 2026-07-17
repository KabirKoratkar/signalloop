"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LoopEvent,
  LoopRun,
  MetricSnapshot,
  StrategySnapshot,
} from "@/lib/signalloop/loop";
import { sponsorRoles } from "@/lib/signalloop/adapters";

type RunState = "idle" | "loading" | "running" | "complete" | "error";

const phaseOrder = ["OBSERVE", "REASON", "PLAN", "GUARD", "ACT", "VERIFY"];

const sleep = (duration: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, duration);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

function formatRate(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card--accent" : ""}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EventRow({ event, index }: { event: LoopEvent; index: number }) {
  return (
    <li className={`event-row event-row--${event.kind}`}>
      <div className="event-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="event-marker" aria-hidden="true" />
      <div className="event-copy">
        <div className="event-meta">
          <span>{event.phase}</span>
          <span>{event.provider}</span>
        </div>
        <h3>{event.title}</h3>
        <p>{event.detail}</p>
        {event.evidence ? <blockquote>{event.evidence}</blockquote> : null}
      </div>
    </li>
  );
}

const initialMetrics: MetricSnapshot = {
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

export function SignalLoopDashboard() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [run, setRun] = useState<LoopRun | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const visibleEvents = useMemo(
    () => run?.events.slice(0, visibleCount) ?? [],
    [run, visibleCount],
  );

  const metrics = useMemo(
    () =>
      [...visibleEvents].reverse().find((event) => event.metrics)?.metrics ??
      run?.before.metrics ??
      initialMetrics,
    [run, visibleEvents],
  );

  const strategy = useMemo(
    () =>
      [...visibleEvents].reverse().find((event) => event.strategy)?.strategy ??
      run?.before.strategy ??
      initialStrategy,
    [run, visibleEvents],
  );

  const activeEvent = visibleEvents.at(-1);
  const blocked = activeEvent?.kind === "blocked";
  const phase = activeEvent?.phase.toUpperCase() ?? "READY";
  const strategyEngine = run?.strategyEngine;
  const capabilityGateway = run?.capabilityGateway;
  const strategyEngineLabel =
    runState === "loading"
      ? "OpenAI · checking"
      : strategyEngine?.mode === "live"
        ? `${strategyEngine.provider} · live`
        : strategyEngine
          ? `${strategyEngine.provider} · demo fallback`
          : "TraceLayer · 3-day replay";
  const displayedSponsorRoles = sponsorRoles.map((sponsor) => {
    if (sponsor.name === strategyEngine?.provider) {
      return {
        ...sponsor,
        state:
          strategyEngine.mode === "live" ? "live inference" : "demo fallback",
      };
    }
    if (sponsor.name === "Zero" && capabilityGateway) {
      return {
        ...sponsor,
        state:
          capabilityGateway.mode === "live-discovery"
            ? "live discovery"
            : "demo fallback",
      };
    }
    return sponsor;
  });

  async function runLoop() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunState("loading");
    setVisibleCount(0);

    try {
      const response = await fetch("/api/demo-loop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scenario: "pivot-to-fintech",
          zeroMode: "discover",
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("The loop could not be started.");
      const nextRun = (await response.json()) as LoopRun;
      setRun(nextRun);
      setRunState("running");

      for (let index = 1; index <= nextRun.events.length; index += 1) {
        const event = nextRun.events[index - 1];
        await sleep(event.kind === "blocked" ? 1350 : 780, controller.signal);
        setVisibleCount(index);
      }

      setRunState("complete");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRunState("error");
    }
  }

  function resetLoop() {
    abortRef.current?.abort();
    setRunState("idle");
    setRun(null);
    setVisibleCount(0);
  }

  const displayedExperiments =
    run?.experiments.filter((experiment) => visibleCount >= experiment.revealAfter) ?? [
      {
        id: "day-1",
        day: "DAY 01",
        audience: "Engineering leaders",
        message: "Reduce AI infrastructure cost",
        sent: 22,
        positive: 0,
        meetings: 0,
        rate: 0,
        verdict: "Rejected" as const,
        revealAfter: 0,
      },
    ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="SignalLoop home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>
            SignalLoop
            <small>Autonomous outbound lab</small>
          </span>
        </a>

        <div
          className="topbar-center"
          aria-label="Strategy engine status"
          title={strategyEngine?.modelId}
        >
          <span
            className={`status-dot${
              strategyEngine?.mode === "deterministic-fallback"
                ? " status-dot--fallback"
                : ""
            }`}
          />
          {strategyEngineLabel}
        </div>

        <div className="topbar-actions">
          {runState !== "idle" ? (
            <button className="button button--quiet" onClick={resetLoop} type="button">Reset</button>
          ) : null}
          <button
            className="button button--primary"
            disabled={runState === "loading" || runState === "running"}
            onClick={runLoop}
            type="button"
          >
            {runState === "loading"
              ? "Loading experiment…"
              : runState === "running"
                ? `Looping · ${visibleCount}/${run?.events.length ?? 10}`
                : runState === "complete"
                  ? "Run again"
                  : "Run learning loop"}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <div className="hero-kicker">
            <span>MISSION 01</span>
            <span>FIND REPEATABLE DEMAND</span>
          </div>
          <h1>Turn every reply into<span> tomorrow’s strategy.</span></h1>
        </div>
        <p>
          SignalLoop researches, tests, observes, and rewrites your outbound
          playbook every day—inside a hard safety boundary.
        </p>
      </section>

      <section className="metric-grid" aria-label="Campaign metrics">
        <MetricCard accent detail="winning variant" label="Latest positive" value={formatRate(metrics.latestPositiveRate)} />
        <MetricCard detail="qualified calls" label="Meetings" value={String(metrics.meetings)} />
        <MetricCard detail="verified prospects" label="Contacts tested" value={String(metrics.eligibleContacts)} />
        <MetricCard detail="unsafe sends stopped" label="Policy blocks" value={String(metrics.policyBlocks)} />
        <MetricCard detail="sender health" label="Reputation" value={`${metrics.reputationScore}/100`} />
      </section>

      <section className="workspace-grid">
        <article className="panel strategy-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Current hypothesis</span>
              <h2>What SignalLoop believes now</h2>
            </div>
            <span className="confidence">{strategy.confidence}% confidence</span>
          </div>

          <div className="strategy-stack">
            <div className="strategy-row"><span>Audience</span><strong>{strategy.audience}</strong></div>
            <div className="strategy-row"><span>Urgent pain</span><strong>{strategy.angle}</strong></div>
            <div className="strategy-row"><span>Proof</span><strong>{strategy.proof}</strong></div>
          </div>

          <div className="message-preview">
            <div className="message-chrome"><span>LIVE MESSAGE</span><span>VARIANT A</span></div>
            <p className="message-subject">
              {strategy.confidence >= 80
                ? "Audit evidence for every agent action"
                : strategy.confidence >= 60
                  ? "Can you prove what your AI agents accessed?"
                  : "Cut your AI infrastructure bill by 30%"}
            </p>
            <p>
              {strategy.confidence >= 80
                ? "TraceLayer gives fintech security teams an exportable history of every tool, resource, and action an AI agent touched. Worth a 15-minute walkthrough?"
                : strategy.confidence >= 60
                  ? "TraceLayer turns agent tool activity into audit-ready evidence—before your next access review. Open to seeing the workflow?"
                  : "TraceLayer helps engineering teams reduce inference overhead without changing their models. Is AI spend a priority this quarter?"}
            </p>
          </div>

          <div className="belief-map" aria-label="Audience belief scores">
            <div>
              <span>Engineering</span>
              <i style={{ width: strategy.confidence >= 60 ? "12%" : "48%" }} />
              <b>{strategy.confidence >= 60 ? "12" : "48"}</b>
            </div>
            <div>
              <span>SaaS security</span>
              <i style={{ width: strategy.confidence >= 80 ? "44%" : "18%" }} />
              <b>{strategy.confidence >= 80 ? "44" : "18"}</b>
            </div>
            <div className="belief-map__winner">
              <span>Fintech security</span>
              <i style={{ width: strategy.confidence >= 80 ? "91%" : "24%" }} />
              <b>{strategy.confidence >= 80 ? "91" : "24"}</b>
            </div>
          </div>
        </article>

        <article className={`panel trace-panel${blocked ? " trace-panel--blocked" : ""}`}>
          <div className="panel-heading trace-heading">
            <div>
              <span className="eyebrow">Live agent trace</span>
              <h2>{blocked ? "Blast radius contained" : activeEvent?.title ?? "Ready to learn"}</h2>
            </div>
            <span className={`phase-chip phase-chip--${activeEvent?.kind ?? "idle"}`}>{phase}</span>
          </div>

          <div className="phase-track" aria-label="Loop phases">
            {phaseOrder.map((item) => <span className={item === phase ? "is-active" : ""} key={item}>{item}</span>)}
          </div>

          {visibleEvents.length ? (
            <ol className="event-list" aria-live="polite">
              {visibleEvents.map((event, index) => <EventRow event={event} index={index} key={event.id} />)}
            </ol>
          ) : (
            <div className="empty-trace">
              <div className="orbit" aria-hidden="true"><span>S</span></div>
              <h3>One click. Three days of learning.</h3>
              <p>Replay the moment SignalLoop rejects a weak ICP, finds a sharper pain, gets blocked from over-sending, and safely replans.</p>
              <button className="text-button" onClick={runLoop} type="button">Start the replay <span aria-hidden="true">→</span></button>
            </div>
          )}

          {runState === "error" ? <p className="error-message" role="alert">The demo loop did not start. Reset and try once more.</p> : null}
        </article>
      </section>

      <section className="panel experiment-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">Experiment ledger</span><h2>Strategy changes only when the evidence does</h2></div>
          <span className="ledger-note">POSITIVE REPLIES · NOT OPENS</span>
        </div>

        <div className="experiment-table" role="table" aria-label="Outbound experiments">
          <div className="experiment-row experiment-row--head" role="row">
            <span role="columnheader">Cycle</span><span role="columnheader">Audience</span><span role="columnheader">Message</span>
            <span role="columnheader">Sent</span><span role="columnheader">Positive</span><span role="columnheader">Meetings</span><span role="columnheader">Decision</span>
          </div>
          {displayedExperiments.map((experiment) => (
            <div className="experiment-row" role="row" key={experiment.id}>
              <span className="mono" role="cell">{experiment.day}</span>
              <span role="cell">{experiment.audience}</span><span role="cell">{experiment.message}</span>
              <span className="mono" role="cell">{experiment.sent}</span>
              <span className="rate-cell mono" role="cell">{experiment.positive} <small>{formatRate(experiment.rate)}</small></span>
              <span className="mono" role="cell">{experiment.meetings}</span>
              <span role="cell"><b className={`verdict verdict--${experiment.verdict.toLowerCase()}`}>{experiment.verdict}</b></span>
            </div>
          ))}
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel guardrail-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Hard boundary</span><h2>Autonomy without the spam cannon.</h2></div>
            <span className="shield" aria-label="Modeled policy boundary">P</span>
          </div>
          <ul>
            <li><span>Maximum daily send</span><strong>50</strong></li>
            <li><span>Maximum volume growth</span><strong>2×</strong></li>
            <li><span>Verified addresses</span><strong>Required</strong></li>
            <li><span>Suppression list</span><strong>Always enforced</strong></li>
          </ul>
        </article>

        <article className="panel playbook-panel">
          <span className="eyebrow">Learned playbook</span>
          <h2>{strategy.confidence >= 90 ? "Fintech security · audit evidence" : "Still gathering evidence…"}</h2>
          <p>{strategy.confidence >= 90
            ? "Target 100–1,000 person fintechs approaching an access review. Lead with proof, not fear. Ask for a 15-minute audit workflow walkthrough."
            : "SignalLoop will publish the next audience, trigger, pain, proof, and CTA only after the experiment closes."}</p>
          <div className="playbook-footer"><span>Tomorrow</span><strong>{strategy.confidence >= 90 ? "Run another capped validation batch" : "Waiting for loop"}</strong></div>
        </article>
      </section>

      <footer className="sponsor-rail">
        <div><span className="eyebrow">Integration readiness</span><p>Each boundary reports what is real in this build.</p></div>
        <ol>
          {displayedSponsorRoles.map((sponsor, index) => (
            <li key={sponsor.name}>
              <span>{String(index + 1).padStart(2, "0")}</span><strong>{sponsor.name}</strong><small>{sponsor.role}</small><i>{sponsor.state}</i>
            </li>
          ))}
        </ol>
      </footer>
    </main>
  );
}
