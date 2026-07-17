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
  return requestUrl(`http://localhost${path}`, init);
}

async function requestUrl(url, init = {}) {
  const worker = await getWorker();
  return worker.fetch(
    new Request(url, init),
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
  assert.match(html, /OpenAI/);
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
  assert.equal(run.strategyEngine.provider, "OpenAI");
  assert.equal(run.strategyEngine.mode, "deterministic-fallback");
  assert.equal(run.strategyEngine.fallbackCode, "forced-demo");
  assert.equal(run.capabilityGateway.provider, "Zero");
  assert.equal(run.capabilityGateway.mode, "deterministic-fallback");
  assert.equal(run.capabilityGateway.fallbackCode, "forced-demo");
  assert.equal(run.events[1].provider, "SignalLoop");
  assert.equal(
    run.events.some((event) => ["Nexla", "Pomerium"].includes(event.provider)),
    false,
  );
});

test("a normal run performs live Zero discovery without spending", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAIEnabled = process.env.OPENAI_LIVE_ENABLED;
  const originalZeroEnabled = process.env.ZERO_LIVE_ENABLED;
  const zeroRequests = [];

  process.env.OPENAI_LIVE_ENABLED = "false";
  process.env.ZERO_LIVE_ENABLED = "true";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("https://api.zero.xyz/")) {
      return originalFetch(input, init);
    }

    zeroRequests.push({ url, init });
    if (url.includes("/v1/search")) {
      return Response.json({
        searchId: "srch_test",
        capabilities: [
          {
            id: "cap_test",
            token: "z_Test12.1",
            position: 1,
            slug: "test-email-verifier",
            name: "Test Email Verifier",
            description: "Checks email deliverability without sending email.",
            whatItDoes: "Checks email deliverability.",
            method: "GET",
            url: "https://verifier.example/api/check",
            cost: { amount: "0.005", asset: "USDC" },
            pricing: { kind: "static", summary: "$0.005/call" },
            protocol: "x402",
            rating: {
              score: "5.00",
              successRate: "1.00",
              reviews: 1,
              state: "rated",
            },
            availabilityStatus: "healthy",
          },
        ],
      });
    }

    if (url.includes("/v1/capabilities/")) {
      return Response.json({
        uid: "cap_test",
        slug: "test-email-verifier",
        name: "Test Email Verifier",
        description: "Checks email deliverability without sending email.",
        url: "https://verifier.example/api/check",
        method: "GET",
        headers: {},
        bodySchema: {
          type: "object",
          properties: {
            input: {
              type: "object",
              properties: {
                queryParams: {
                  type: "object",
                  properties: { email: { type: "string" } },
                },
              },
            },
          },
        },
        responseSchema: null,
        example: null,
        tags: ["x402"],
        displayCostAmount: "0.005",
        displayCostAsset: "USDC",
        reviewCount: 1,
        rating: {
          score: "5.00",
          successRate: "1.00",
          reviews: 1,
          state: "rated",
        },
        paymentMethods: [
          {
            uid: "pm_test",
            protocol: "x402",
            methodType: "crypto",
            chain: "base",
            mode: "charge",
            costAmount: "0.005",
            costPer: "request",
            priority: 0,
          },
        ],
        pricing: {
          kind: "static",
          summary: "$0.005/call",
          primary: {
            kind: "static",
            protocol: "x402",
            network: "base",
            amountUsd: "0.005",
            per: "call",
            confidence: "exact",
          },
          accepted: [],
        },
        availabilityStatus: "healthy",
      });
    }

    throw new Error(`Unexpected Zero request: ${url}`);
  };

  try {
    const response = await request("/api/demo-loop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenario: "pivot-to-fintech",
        zeroMode: "discover",
      }),
    });
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(run.capabilityGateway.mode, "live-discovery");
    assert.equal(run.capabilityGateway.capabilityName, "Test Email Verifier");
    assert.equal(run.capabilityGateway.pricing, "$0.005/call");
    assert.equal(run.capabilityGateway.paymentAmount, undefined);
    assert.deepEqual(
      zeroRequests.map(({ url }) => new URL(url).pathname),
      ["/v1/search", "/v1/capabilities/z_Test12.1"],
    );
    assert.equal(zeroRequests[0].init?.method, "POST");
    assert.equal(
      new Headers(zeroRequests[0].init?.headers).get("authorization"),
      null,
    );
    assert.deepEqual(JSON.parse(zeroRequests[0].init?.body), {
      query: "verify business email address deliverability without sending email",
      availabilityStatus: "healthy",
      limit: 5,
      maxCost: "0.005",
    });
    assert.equal(zeroRequests[1].init?.method, undefined);
    assert.match(run.events[3].detail, /searched its live index/i);
    assert.match(run.events[3].evidence, /\$0 spent/i);
    assert.equal(run.events[3].provider, "Zero");
    assert.equal(run.events[7].provider, "SignalLoop");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAIEnabled === undefined) delete process.env.OPENAI_LIVE_ENABLED;
    else process.env.OPENAI_LIVE_ENABLED = originalOpenAIEnabled;
    if (originalZeroEnabled === undefined) delete process.env.ZERO_LIVE_ENABLED;
    else process.env.ZERO_LIVE_ENABLED = originalZeroEnabled;
  }
});

test("the web route refuses paid Zero execution modes", async () => {
  const response = await request("/api/demo-loop", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "pivot-to-fintech",
      zeroMode: "verify",
    }),
  });

  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Unknown Zero mode.",
  });
});

test("a remote request cannot trigger paid OpenAI inference", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENAI_API_KEY;
  const originalEnabled = process.env.OPENAI_LIVE_ENABLED;
  let openAICalls = 0;

  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.openai.com/v1/responses") openAICalls += 1;
    return originalFetch(input, init);
  };

  try {
    const response = await requestUrl(
      "https://signalloop.example/api/demo-loop",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "pivot-to-fintech" }),
      },
    );
    const run = await response.json();

    assert.equal(response.status, 200);
    assert.equal(openAICalls, 0);
    assert.equal(run.strategyEngine.mode, "deterministic-fallback");
    assert.equal(run.strategyEngine.fallbackCode, "disabled");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalToken;
    if (originalEnabled === undefined) delete process.env.OPENAI_LIVE_ENABLED;
    else process.env.OPENAI_LIVE_ENABLED = originalEnabled;
  }
});

test("a valid OpenAI response becomes the visible live strategy", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENAI_API_KEY;
  const originalEnabled = process.env.OPENAI_LIVE_ENABLED;
  let openAICalls = 0;

  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url !== "https://api.openai.com/v1/responses") {
      return originalFetch(input, init);
    }

    openAICalls += 1;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer openai-test-key",
    );
    const requestBody = JSON.parse(init.body);
    assert.equal(requestBody.model, "gpt-5.6-luna");
    assert.equal(requestBody.reasoning.effort, "low");
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.text.format.type, "json_schema");
    assert.equal(requestBody.text.format.strict, true);
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
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
      ],
      usage: { input_tokens: 210, output_tokens: 96, total_tokens: 306 },
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
    assert.equal(openAICalls, 1);
    assert.equal(run.strategyEngine.provider, "OpenAI");
    assert.equal(run.strategyEngine.mode, "live");
    assert.equal(run.strategyEngine.inputTokens, 210);
    assert.equal(
      run.events[1].detail,
      "The replies show audit evidence is more urgent than infrastructure cost.",
    );
    assert.equal(run.events[2].strategy.confidence, 68);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalToken;
    if (originalEnabled === undefined) delete process.env.OPENAI_LIVE_ENABLED;
    else process.env.OPENAI_LIVE_ENABLED = originalEnabled;
  }
});

test("invalid OpenAI output falls back without breaking the loop", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENAI_API_KEY;
  const originalEnabled = process.env.OPENAI_LIVE_ENABLED;

  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.openai.com/v1/responses") {
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              { type: "output_text", text: '{"audience":"everyone"}' },
            ],
          },
        ],
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
    if (originalToken === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalToken;
    if (originalEnabled === undefined) delete process.env.OPENAI_LIVE_ENABLED;
    else process.env.OPENAI_LIVE_ENABLED = originalEnabled;
  }
});

test("an OpenAI service rejection is labeled instead of presented as live", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.OPENAI_API_KEY;
  const originalEnabled = process.env.OPENAI_LIVE_ENABLED;

  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_LIVE_ENABLED = "true";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === "https://api.openai.com/v1/responses") {
      return Response.json(
        {
          error: {
            type: "billing_not_active",
            code: "billing_not_active",
            message: "Account billing is not active.",
          },
        },
        { status: 429 },
      );
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
    assert.equal(run.strategyEngine.provider, "OpenAI");
    assert.equal(run.strategyEngine.mode, "deterministic-fallback");
    assert.equal(run.strategyEngine.fallbackCode, "service-error");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalToken;
    if (originalEnabled === undefined) delete process.env.OPENAI_LIVE_ENABLED;
    else process.env.OPENAI_LIVE_ENABLED = originalEnabled;
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
