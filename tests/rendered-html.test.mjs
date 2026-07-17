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
    body: JSON.stringify({ scenario: "pivot-to-fintech" }),
  });

  assert.equal(response.status, 200);
  const run = await response.json();
  assert.equal(run.scenario, "pivot-to-fintech");
  assert.equal(run.events.length, 10);
  assert.equal(run.guardrails.maxDailySends, 50);
  assert.equal(run.guardrails.demoMode, true);
});

test("policy denial is observed before a safe replan", async () => {
  const response = await request("/api/demo-loop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario: "pivot-to-fintech" }),
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
    body: JSON.stringify({ scenario: "pivot-to-fintech" }),
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
