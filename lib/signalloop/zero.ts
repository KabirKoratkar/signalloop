import type {
  ZeroActionSnapshot,
  ZeroFallbackCode,
  ZeroGatewayResult,
} from "./loop";

const ZERO_API_URL = "https://api.zero.xyz";
const SEARCH_QUERY =
  "verify business email address deliverability without sending email";
const MAX_COST_USDC = "0.005";
const REQUEST_TIMEOUT_MS = 20_000;

interface ZeroActionOptions {
  forceDemo?: boolean;
}

interface SearchCapability {
  id: string;
  token?: string | null;
  name: string;
  cost: { amount: string; asset: string };
  pricing?: { summary?: string };
  protocol?: string | null;
}

interface CapabilityDetail {
  uid: string;
  name: string;
  bodySchema: Record<string, unknown> | null;
  displayCostAmount: string;
  pricing?: { summary?: string };
  paymentMethods?: Array<{ protocol?: string }> | null;
}

function configuredValue(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fallbackAction(): ZeroActionSnapshot {
  return {
    title: "Replay a verified test cohort",
    detail:
      "Used the deterministic cohort replay. No Zero capability was charged or executed.",
    evidence: "24 fictional contacts · demo replay · $0 spent",
    kind: "info",
  };
}

function fallbackResult(
  code: ZeroFallbackCode,
  latencyMs = 0,
): ZeroGatewayResult {
  return {
    status: {
      provider: "Zero",
      mode: "deterministic-fallback",
      latencyMs,
      fallbackCode: code,
    },
    action: fallbackAction(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSearchCapability(value: unknown): value is SearchCapability {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isRecord(value.cost) &&
    typeof value.cost.amount === "string" &&
    typeof value.cost.asset === "string"
  );
}

function isCapabilityDetail(value: unknown): value is CapabilityDetail {
  return (
    isRecord(value) &&
    typeof value.uid === "string" &&
    typeof value.name === "string" &&
    (value.bodySchema === null || isRecord(value.bodySchema)) &&
    typeof value.displayCostAmount === "string"
  );
}

function hasEmailInput(detail: CapabilityDetail) {
  if (!isRecord(detail.bodySchema)) return false;
  const properties = detail.bodySchema.properties;
  if (!isRecord(properties) || !isRecord(properties.input)) return false;
  const inputProperties = properties.input.properties;
  if (!isRecord(inputProperties)) return false;

  return ["queryParams", "body"].some((key) => {
    const container = inputProperties[key];
    return (
      isRecord(container) &&
      isRecord(container.properties) &&
      isRecord(container.properties.email)
    );
  });
}

async function zeroApi(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body) headers.set("content-type", "application/json");
  try {
    const response = await fetch(`${ZERO_API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Zero returned HTTP ${response.status}.`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverCapability() {
  const searchPayload = await zeroApi("/v1/search", {
    method: "POST",
    body: JSON.stringify({
      query: SEARCH_QUERY,
      availabilityStatus: "healthy",
      limit: 5,
      maxCost: MAX_COST_USDC,
    }),
  });
  if (!isRecord(searchPayload) || !Array.isArray(searchPayload.capabilities)) {
    return null;
  }

  for (const result of searchPayload.capabilities.filter(isSearchCapability)) {
    const identifier = result.token ?? result.id;
    try {
      const detailPayload = await zeroApi(
        `/v1/capabilities/${encodeURIComponent(identifier)}`,
      );
      if (isCapabilityDetail(detailPayload) && hasEmailInput(detailPayload)) {
        return { result, detail: detailPayload };
      }
    } catch {
      // Search results can churn between discovery and inspection.
    }
  }

  return null;
}

function pricingLabel(result: SearchCapability, detail: CapabilityDetail) {
  return (
    detail.pricing?.summary ??
    result.pricing?.summary ??
    `$${result.cost.amount}/call`
  );
}

export async function resolveZeroAction(
  options: ZeroActionOptions = {},
): Promise<ZeroGatewayResult> {
  if (options.forceDemo) return fallbackResult("forced-demo");
  if (configuredValue("ZERO_LIVE_ENABLED")?.toLowerCase() === "false") {
    return fallbackResult("disabled");
  }

  const startedAt = Date.now();
  try {
    const selected = await discoverCapability();
    if (!selected) {
      return fallbackResult("no-capability", Date.now() - startedAt);
    }

    const { result, detail } = selected;
    const pricing = pricingLabel(result, detail);
    const protocol =
      result.protocol ?? detail.paymentMethods?.[0]?.protocol ?? undefined;

    return {
      status: {
        provider: "Zero",
        mode: "live-discovery",
        latencyMs: Date.now() - startedAt,
        capabilityName: detail.name,
        capabilityId: detail.uid,
        pricing,
        protocol,
      },
      action: {
        title: "Discover a live verification capability",
        detail: `Zero searched its live index and inspected ${detail.name}. SignalLoop did not execute it; the cohort remains a fictional replay.`,
        evidence: `${pricing} · ${protocol ?? "payment protocol unknown"} · $0 spent`,
        kind: "info",
      },
    };
  } catch {
    return fallbackResult("service-error", Date.now() - startedAt);
  }
}
