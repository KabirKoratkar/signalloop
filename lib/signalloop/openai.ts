import type {
  StrategyEngineResult,
  StrategyFallbackCode,
  StrategyProposal,
} from "./loop";

const DEFAULT_MODEL_ID = "gpt-5.6-luna";
const REQUEST_TIMEOUT_MS = 25_000;

const fallbackProposal: StrategyProposal = {
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

const campaignEvidence = {
  product: {
    name: "TraceLayer",
    description: "Audit logs and access controls for production AI agents.",
    goal: "Book qualified discovery calls with a repeatable outbound message.",
  },
  completedExperiment: {
    audience: "VPs of Engineering",
    message: "Reduce AI infrastructure cost",
    verifiedContacts: 22,
    positiveReplies: 0,
    meetings: 0,
  },
  replyEvidence: [
    "Spend isn't my issue. Security needs an audit trail before our SOC 2 review.",
    "Across five substantive replies, audit, access review, and SOC 2 language appeared three times.",
  ],
  decision: "Choose the next small audience-and-message hypothesis to test.",
  hardBoundaries: [
    "Strategy only: do not send messages or call external tools.",
    "Ground every change in the supplied evidence.",
    "Do not recommend more than 50 contacts per day.",
    "Only verified contacts are eligible for a later action step.",
  ],
};

interface OpenAIResponse {
  status?: unknown;
  incomplete_details?: { reason?: unknown };
  error?: { message?: unknown };
  output?: Array<{
    type?: unknown;
    content?: Array<{
      type?: unknown;
      text?: unknown;
      refusal?: unknown;
    }>;
  }>;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
}

class InvalidOpenAIResponseError extends Error {}

class OpenAIServiceError extends Error {
  constructor(readonly status: number) {
    super(`OpenAI returned HTTP ${status}.`);
  }
}

function configuredValue(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configuredModelId() {
  return configuredValue("OPENAI_MODEL") ?? DEFAULT_MODEL_ID;
}

function fallbackResult(
  code: StrategyFallbackCode,
  latencyMs = 0,
): StrategyEngineResult {
  return {
    proposal: {
      ...fallbackProposal,
      strategy: { ...fallbackProposal.strategy },
    },
    status: {
      provider: "OpenAI",
      mode: "deterministic-fallback",
      modelId: configuredModelId(),
      latencyMs,
      fallbackCode: code,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: Record<string, unknown>,
  key: string,
  maximumLength: number,
) {
  const candidate = value[key];

  if (typeof candidate !== "string") {
    throw new InvalidOpenAIResponseError(`${key} must be text.`);
  }

  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > maximumLength) {
    throw new InvalidOpenAIResponseError(`${key} has an unsafe length.`);
  }

  return normalized;
}

export function parseOpenAIStrategy(text: string): StrategyProposal {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidOpenAIResponseError("The strategy was not valid JSON.");
  }

  if (!isRecord(value)) {
    throw new InvalidOpenAIResponseError("The strategy must be a JSON object.");
  }

  const expectedKeys = new Set([
    "diagnosis",
    "rationale",
    "evidence",
    "audience",
    "angle",
    "proof",
    "confidence",
  ]);
  if (
    Object.keys(value).length !== expectedKeys.size ||
    Object.keys(value).some((key) => !expectedKeys.has(key))
  ) {
    throw new InvalidOpenAIResponseError(
      "The strategy did not match the required fields.",
    );
  }

  const diagnosis = requiredText(value, "diagnosis", 280);
  const rationale = requiredText(value, "rationale", 280);
  const evidence = requiredText(value, "evidence", 180);
  const audience = requiredText(value, "audience", 90);
  const angle = requiredText(value, "angle", 120);
  const proof = requiredText(value, "proof", 120);
  const confidence = value.confidence;

  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 100
  ) {
    throw new InvalidOpenAIResponseError(
      "confidence must be between 0 and 100.",
    );
  }

  const groundedText = [diagnosis, rationale, evidence, audience, angle, proof]
    .join(" ")
    .toLowerCase();
  const isGrounded = [
    "security",
    "audit",
    "soc 2",
    "compliance",
    "access review",
    "evidence",
  ].some((signal) => groundedText.includes(signal));

  if (!isGrounded) {
    throw new InvalidOpenAIResponseError(
      "The strategy ignored the supplied security and audit evidence.",
    );
  }

  return {
    diagnosis,
    rationale,
    evidence,
    strategy: {
      audience,
      angle,
      proof,
      confidence: Math.round(confidence),
    },
  };
}

function instructions() {
  return [
    "You are the strategy step inside SignalLoop, an outbound experimentation loop.",
    "Diagnose why the completed experiment failed and propose exactly one small next hypothesis.",
    "You may reason about strategy only. You cannot send email, enrich contacts, or bypass hard boundaries.",
    "Ground the answer in the supplied campaign evidence, keep each field concise, and do not expose hidden reasoning.",
  ].join("\n");
}

function strategySchema() {
  return {
    type: "object",
    properties: {
      diagnosis: { type: "string" },
      rationale: { type: "string" },
      evidence: { type: "string" },
      audience: { type: "string" },
      angle: { type: "string" },
      proof: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 100 },
    },
    required: [
      "diagnosis",
      "rationale",
      "evidence",
      "audience",
      "angle",
      "proof",
      "confidence",
    ],
    additionalProperties: false,
  };
}

function extractOutputText(payload: OpenAIResponse) {
  if (payload.status === "incomplete") {
    const reason = payload.incomplete_details?.reason;
    throw new InvalidOpenAIResponseError(
      `OpenAI stopped before completing the strategy (${String(reason ?? "unknown")}).`,
    );
  }

  if (payload.status !== "completed") {
    throw new InvalidOpenAIResponseError(
      `OpenAI returned an unexpected status (${String(payload.status ?? "missing")}).`,
    );
  }

  const content = (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []);

  if (content.some((item) => item.type === "refusal")) {
    throw new InvalidOpenAIResponseError("OpenAI refused the strategy request.");
  }

  const textParts = content.filter(
    (item) => item.type === "output_text" && typeof item.text === "string",
  );
  if (textParts.length !== 1 || typeof textParts[0].text !== "string") {
    throw new InvalidOpenAIResponseError(
      "OpenAI did not return exactly one structured strategy.",
    );
  }

  return textParts[0].text;
}

export async function resolveOpenAIStrategy(options?: {
  forceDemo?: boolean;
  allowLive?: boolean;
}): Promise<StrategyEngineResult> {
  if (options?.forceDemo) return fallbackResult("forced-demo");
  if (!options?.allowLive) return fallbackResult("disabled");

  if (configuredValue("OPENAI_LIVE_ENABLED")?.toLowerCase() !== "true") {
    return fallbackResult("disabled");
  }

  const apiKey = configuredValue("OPENAI_API_KEY");
  if (!apiKey) return fallbackResult("missing-api-key");

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const modelId = configuredModelId();

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        instructions: instructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(campaignEvidence),
              },
            ],
          },
        ],
        reasoning: { effort: "low" },
        max_output_tokens: 1_600,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "signalloop_strategy",
            strict: true,
            schema: strategySchema(),
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) throw new OpenAIServiceError(response.status);

    const payload = (await response.json()) as OpenAIResponse;
    const proposal = parseOpenAIStrategy(extractOutputText(payload));

    return {
      proposal,
      status: {
        provider: "OpenAI",
        mode: "live",
        modelId,
        latencyMs: Date.now() - startedAt,
        stopReason: "completed",
        inputTokens:
          typeof payload.usage?.input_tokens === "number"
            ? payload.usage.input_tokens
            : undefined,
        outputTokens:
          typeof payload.usage?.output_tokens === "number"
            ? payload.usage.output_tokens
            : undefined,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (error instanceof InvalidOpenAIResponseError) {
      return fallbackResult("invalid-response", latencyMs);
    }
    if (error instanceof OpenAIServiceError) {
      return fallbackResult("service-error", latencyMs);
    }
    if (error instanceof Error && error.name === "AbortError") {
      return fallbackResult("timeout", latencyMs);
    }
    return fallbackResult("service-error", latencyMs);
  } finally {
    clearTimeout(timeout);
  }
}
