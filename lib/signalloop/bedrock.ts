import type {
  StrategyEngineResult,
  StrategyFallbackCode,
  StrategyProposal,
} from "./loop";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_MODEL_ID = "us.amazon.nova-2-lite-v1:0";
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

interface ConverseResponse {
  output?: {
    message?: {
      content?: Array<{ text?: unknown }>;
    };
  };
  stopReason?: unknown;
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
  };
  metrics?: {
    latencyMs?: unknown;
  };
}

class InvalidBedrockResponseError extends Error {}

class BedrockServiceError extends Error {
  constructor(readonly status: number) {
    super(`Bedrock returned HTTP ${status}.`);
  }
}

function configuredValue(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configuredRegion() {
  const region = configuredValue("AWS_REGION") ?? DEFAULT_REGION;
  return /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region) ? region : DEFAULT_REGION;
}

function configuredModelId() {
  return configuredValue("BEDROCK_MODEL_ID") ?? DEFAULT_MODEL_ID;
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
      provider: "AWS Bedrock",
      mode: "deterministic-fallback",
      modelId: configuredModelId(),
      region: configuredRegion(),
      latencyMs,
      fallbackCode: code,
    },
  };
}

function extractJson(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new InvalidBedrockResponseError("No JSON object was returned.");
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    throw new InvalidBedrockResponseError("The strategy was not valid JSON.");
  }
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
    throw new InvalidBedrockResponseError(`${key} must be text.`);
  }

  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (normalized.length < 3 || normalized.length > maximumLength) {
    throw new InvalidBedrockResponseError(`${key} has an unsafe length.`);
  }

  return normalized;
}

export function parseBedrockStrategy(text: string): StrategyProposal {
  const value = extractJson(text);
  if (!isRecord(value)) {
    throw new InvalidBedrockResponseError("The strategy must be a JSON object.");
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
  if (Object.keys(value).some((key) => !expectedKeys.has(key))) {
    throw new InvalidBedrockResponseError("The strategy included unknown fields.");
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
    throw new InvalidBedrockResponseError("confidence must be between 0 and 100.");
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
    throw new InvalidBedrockResponseError(
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

function prompt() {
  return [
    "You are the strategy step inside SignalLoop, an outbound experimentation loop.",
    "Diagnose why the completed experiment failed and propose exactly one small next hypothesis.",
    "You may reason about strategy only. You cannot send email, enrich contacts, or bypass hard boundaries.",
    "Return only one JSON object with exactly these keys:",
    '{"diagnosis":"one evidence-grounded sentence","rationale":"one sentence explaining the next test","evidence":"the strongest supplied signal","audience":"specific buyer role","angle":"urgent pain or outcome","proof":"proof point to lead with","confidence":61}',
    "Confidence must be a number from 0 to 100. Do not include markdown or hidden reasoning.",
  ].join("\n");
}

export async function resolveBedrockStrategy(options?: {
  forceDemo?: boolean;
}): Promise<StrategyEngineResult> {
  if (options?.forceDemo) return fallbackResult("forced-demo");

  if (configuredValue("BEDROCK_LIVE_ENABLED")?.toLowerCase() === "false") {
    return fallbackResult("disabled");
  }

  const apiKey = configuredValue("AWS_BEARER_TOKEN_BEDROCK");
  if (!apiKey) return fallbackResult("missing-api-key");

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const region = configuredRegion();
  const modelId = configuredModelId();

  try {
    const response = await fetch(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          system: [{ text: prompt() }],
          messages: [
            {
              role: "user",
              content: [{ text: JSON.stringify(campaignEvidence) }],
            },
          ],
          inferenceConfig: {
            maxTokens: 700,
            temperature: 0.1,
            topP: 0.9,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) throw new BedrockServiceError(response.status);

    const payload = (await response.json()) as ConverseResponse;
    const stopReason =
      typeof payload.stopReason === "string" ? payload.stopReason : undefined;
    if (stopReason && stopReason !== "end_turn" && stopReason !== "stop_sequence") {
      throw new InvalidBedrockResponseError(
        `Bedrock stopped before completing the strategy (${stopReason}).`,
      );
    }

    const text = payload.output?.message?.content?.find(
      (block) => typeof block.text === "string",
    )?.text;
    if (typeof text !== "string") {
      throw new InvalidBedrockResponseError("Bedrock returned no text strategy.");
    }

    const proposal = parseBedrockStrategy(text);
    const latencyMs =
      typeof payload.metrics?.latencyMs === "number"
        ? payload.metrics.latencyMs
        : Date.now() - startedAt;

    return {
      proposal,
      status: {
        provider: "AWS Bedrock",
        mode: "live",
        modelId,
        region,
        latencyMs,
        stopReason,
        inputTokens:
          typeof payload.usage?.inputTokens === "number"
            ? payload.usage.inputTokens
            : undefined,
        outputTokens:
          typeof payload.usage?.outputTokens === "number"
            ? payload.usage.outputTokens
            : undefined,
      },
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (error instanceof InvalidBedrockResponseError) {
      return fallbackResult("invalid-response", latencyMs);
    }
    if (error instanceof BedrockServiceError) {
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
