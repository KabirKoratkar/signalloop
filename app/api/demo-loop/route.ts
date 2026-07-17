import { createDemoRun } from "@/lib/signalloop/loop";
import { resolveBedrockStrategy } from "@/lib/signalloop/bedrock";

export async function POST(request: Request) {
  let scenario: unknown;
  let strategyMode: unknown;

  try {
    const body = (await request.json()) as {
      scenario?: unknown;
      strategyMode?: unknown;
    };
    scenario = body.scenario;
    strategyMode = body.strategyMode;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (scenario !== "pivot-to-fintech") {
    return Response.json({ error: "Unknown demo scenario." }, { status: 422 });
  }

  if (strategyMode !== undefined && strategyMode !== "demo") {
    return Response.json({ error: "Unknown strategy mode." }, { status: 422 });
  }

  const strategyResult = await resolveBedrockStrategy({
    forceDemo: strategyMode === "demo",
  });

  return Response.json(createDemoRun(strategyResult), {
    headers: { "cache-control": "no-store" },
  });
}
