import { createDemoRun } from "@/lib/signalloop/loop";

export async function POST(request: Request) {
  let scenario: unknown;

  try {
    const body = (await request.json()) as { scenario?: unknown };
    scenario = body.scenario;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (scenario !== "pivot-to-fintech") {
    return Response.json({ error: "Unknown demo scenario." }, { status: 422 });
  }

  return Response.json(createDemoRun(), {
    headers: { "cache-control": "no-store" },
  });
}
