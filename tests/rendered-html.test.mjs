import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function getWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

async function request(path = "/", init = {}) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the SignalLoop product shell", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>SignalLoop — Autonomous outbound experiments<\/title>/i);
  assert.match(html, /Turn every reply into/);
  assert.match(html, /Run learning loop/);
  assert.match(html, /Autonomy without the spam cannon/);
  assert.match(html, /AWS Bedrock/);
  assert.match(html, /Nexla/);
  assert.match(html, /Zero/);
  assert.match(html, /Pomerium/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("demo API returns the deterministic learning loop", async () => {
  const response = await request("/api/demo-loop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "pivot-to-fintech",
      strategyMode: "demo",
    }),
  });

  assert.equal(response.status, 200);
  const run = await response.json();
  assert.equal(run.scenario, "pivot-to-fintech");
  assert.equal(run.events.length, 10);
  assert.equal(run.guardrails.maxDailySends, 50);
  assert.equal(run.guardrails.demoMode, true);
  assert.equal(run.strategyEngine.provider, "AWS Bedrock");
  assert.equal(run.strategyEngine.mode, "deterministic-fallback");
  assert.equal(run.strategyEngine.fallbackCode, "forced-demo");
});

test("a valid Bedrock response becomes the visible live strategy", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const originalEnabled = process.env.BEDROCK_LIVE_ENABLED;
  let bedrockCalls = 0;

  process.env.AWS_BEARER_TOKEN_BEDROCK = "bedrock-test-token";
  process.env.BEDROCK_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("https://bedrock-runtime.")) {
      return originalFetch(input, init);
    }

    bedrockCalls += 1;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer bedrock-test-token",
    );
    return Response.json({
      output: {
        message: {
          content: [
            {
              text: JSON.stringify({
                diagnosis:
                  "The replies show audit evidence is more urgent than infrastructure cost.",
                rationale:
                  "Test security leaders with an audit-readiness outcome tied to their next access review.",
                evidence:
                  "Audit, access review, and SOC 2 appeared in substantive replies.",
                audience: "Security leaders preparing for access reviews",
                angle: "Audit-ready AI agent access",
                proof: "Evidence for every tool action",
                confidence: 68,
              }),
            },
          ],
        },
      },
      stopReason: "end_turn",
      usage: { inputTokens: 210, outputTokens: 96 },
      metrics: { latencyMs: 42 },
    });
  };

  try {
    const response = await request("/api/demo-loop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "pivot-to-fintech" }),
    });
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(bedrockCalls, 1);
    assert.equal(run.strategyEngine.mode, "live");
    assert.equal(run.strategyEngine.inputTokens, 210);
    assert.equal(
      run.events[1].detail,
      "The replies show audit evidence is more urgent than infrastructure cost.",
    );
    assert.equal(run.events[2].strategy.confidence, 68);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
    if (originalEnabled === undefined) delete process.env.BEDROCK_LIVE_ENABLED;
    else process.env.BEDROCK_LIVE_ENABLED = originalEnabled;
  }
});

test("invalid Bedrock output falls back without breaking the loop", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const originalEnabled = process.env.BEDROCK_LIVE_ENABLED;

  process.env.AWS_BEARER_TOKEN_BEDROCK = "bedrock-test-token";
  process.env.BEDROCK_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://bedrock-runtime.")) {
      return Response.json({
        output: {
          message: { content: [{ text: '{"audience":"everyone"}' }] },
        },
        stopReason: "end_turn",
      });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await request("/api/demo-loop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: "pivot-to-fintech" }),
    });
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(run.events.length, 10);
    assert.equal(run.strategyEngine.mode, "deterministic-fallback");
    assert.equal(run.strategyEngine.fallbackCode, "invalid-response");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = originalToken;
    if (originalEnabled === undefined) delete process.env.BEDROCK_LIVE_ENABLED;
    else process.env.BEDROCK_LIVE_ENABLED = originalEnabled;
  }
});

test("policy denial is observed before a safe replan", async () => {
  const response = await request("/api/demo-loop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "pivot-to-fintech",
      strategyMode: "demo",
    }),
  });
  const run = await response.json();

  const deniedIndex = run.events.findIndex((event) => event.kind === "blocked");
  const replanIndex = run.events.findIndex(
    (event) => event.id === "evt-reason-replan",
  );
  const safeActionIndex = run.events.findIndex(
    (event) => event.id === "evt-act-split-test",
  );

  assert.ok(deniedIndex >= 0);
  assert.ok(replanIndex > deniedIndex);
  assert.ok(safeActionIndex > replanIndex);
  assert.match(run.events[replanIndex].evidence, /below 50\/day cap/);
  assert.match(run.events[safeActionIndex].evidence, /40 sent/);
});

test("the loop improves outcomes without weakening guardrails", async () => {
  const response = await request("/api/demo-loop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "pivot-to-fintech",
      strategyMode: "demo",
    }),
  });
  const run = await response.json();
  const finalEvent = run.events.at(-1);

  assert.ok(finalEvent.metrics.latestPositiveRate > run.before.metrics.latestPositiveRate);
  assert.ok(finalEvent.metrics.meetings > run.before.metrics.meetings);
  assert.equal(finalEvent.metrics.reputationScore, 98);
  assert.equal(run.guardrails.verifiedEmailsOnly, true);
});

test("starter preview is fully removed", async () => {
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /SignalLoopDashboard/);
  assert.match(layout, /SignalLoop — Autonomous outbound experiments/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(templateRoot);
});
