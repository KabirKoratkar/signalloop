import { createDemoRun } from "@/lib/signalloop/loop";
import { resolveOpenAIStrategy } from "@/lib/signalloop/openai";
import { resolveZeroAction } from "@/lib/signalloop/zero";
import { resolveNexlaSignals } from "@/lib/signalloop/nexla";

function isLoopbackRequest(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export async function POST(request: Request) {
  let scenario: unknown;
  let strategyMode: unknown;
  let zeroMode: unknown;

  try {
    const body = (await request.json()) as {
      scenario?: unknown;
      strategyMode?: unknown;
      zeroMode?: unknown;
    };
    scenario = body.scenario;
    strategyMode = body.strategyMode;
    zeroMode = body.zeroMode;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (scenario !== "pivot-to-fintech") {
    return Response.json({ error: "Unknown demo scenario." }, { status: 422 });
  }

  if (strategyMode !== undefined && strategyMode !== "demo") {
    return Response.json({ error: "Unknown strategy mode." }, { status: 422 });
  }

  if (
    zeroMode !== undefined &&
    zeroMode !== "discover"
  ) {
    return Response.json({ error: "Unknown Zero mode." }, { status: 422 });
  }

  const forceDemo = strategyMode === "demo";
  const [strategyResult, zeroResult, nexlaResult] = await Promise.all([
    resolveOpenAIStrategy({
      forceDemo,
      allowLive: isLoopbackRequest(request),
    }),
    resolveZeroAction({
      forceDemo: forceDemo || zeroMode === undefined,
    }),
    resolveNexlaSignals({ forceDemo }),
  ]);

  return Response.json(createDemoRun(strategyResult, zeroResult, nexlaResult), {
    headers: { "cache-control": "no-store" },
  });
}
