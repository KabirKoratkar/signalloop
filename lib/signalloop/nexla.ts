import type {
  ExperimentResult,
  NexlaFallbackCode,
  NexlaSignalResult,
} from "./loop";

const NEXLA_HOSTNAME = "api-genai.nexla.io";
const TOOL_NAME = "nexset_read_signalloop_events_schema";
const REQUEST_TIMEOUT_MS = 35_000;
const MAX_RESPONSE_TEXT_LENGTH = 200_000;
const EXPECTED_ROW_COUNT = 6;

// This query is deliberately immutable. The browser cannot provide SQL, a tool
// name, a table name, or a limit to the MCP call.
const CAMPAIGN_SUMMARY_QUERY = `SELECT
  campaign_id,
  audience,
  industry,
  variant,
  COUNT(DISTINCT contact_id) FILTER (WHERE eligible IS TRUE)::integer AS unique_contacts_sent,
  COUNT(DISTINCT contact_id) FILTER (
    WHERE eligible IS TRUE
      AND (positive_reply IS TRUE OR reply_outcome = 'positive')
  )::integer AS positive_replies,
  COUNT(DISTINCT contact_id) FILTER (
    WHERE eligible IS TRUE AND meeting_booked IS TRUE
  )::integer AS meetings_booked
FROM public.signalloop_events
WHERE campaign_id IS NOT NULL
GROUP BY campaign_id, audience, industry, variant
ORDER BY campaign_id, audience, industry, variant
LIMIT 20`;

interface NexlaOptions {
  forceDemo?: boolean;
}

interface CampaignSummaryRow {
  campaign_id: string;
  audience: string;
  industry: string;
  variant: string;
  unique_contacts_sent: number;
  positive_replies: number;
  meetings_booked: number;
}

class InvalidNexlaResponseError extends Error {}
class EmptyNexlaResponseError extends Error {}
class NexlaToolError extends Error {}

function configuredValue(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fallbackResult(
  fallbackCode: NexlaFallbackCode,
  latencyMs = 0,
): NexlaSignalResult {
  return {
    status: {
      provider: "Nexla",
      mode: "deterministic-fallback",
      latencyMs,
      rowCount: 0,
      fallbackCode,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: unknown, key: string) {
  if (typeof value !== "string") {
    throw new InvalidNexlaResponseError(`${key} must be text.`);
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 120) {
    throw new InvalidNexlaResponseError(`${key} has an invalid length.`);
  }
  return normalized;
}

function nonNegativeInteger(value: unknown, key: string) {
  const candidate =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < 0 ||
    candidate > 100_000
  ) {
    throw new InvalidNexlaResponseError(`${key} must be a safe count.`);
  }
  return candidate;
}

function looksLikeCampaignRows(value: unknown[]) {
  return (
    value.length > 0 &&
    value.every(
      (row) =>
        isRecord(row) &&
        "campaign_id" in row &&
        "audience" in row &&
        "industry" in row &&
        "variant" in row,
    )
  );
}

function dataframeColumnRows(value: Record<string, unknown>) {
  if (!Array.isArray(value.columns) || !Number.isSafeInteger(value.rows)) {
    return undefined;
  }

  const rowCount = Number(value.rows);
  if (rowCount < 0 || rowCount > 1_000) {
    throw new InvalidNexlaResponseError("The MCP dataframe row count was invalid.");
  }

  const columns = value.columns.map((column) => {
    if (
      !isRecord(column) ||
      typeof column.name !== "string" ||
      !Array.isArray(column.values) ||
      column.values.length !== rowCount
    ) {
      throw new InvalidNexlaResponseError("The MCP dataframe columns were invalid.");
    }
    return { name: column.name, values: column.values };
  });

  if (new Set(columns.map((column) => column.name)).size !== columns.length) {
    throw new InvalidNexlaResponseError("The MCP dataframe repeated a column.");
  }

  return Array.from({ length: rowCount }, (_, rowIndex) =>
    Object.fromEntries(
      columns.map((column) => [column.name, column.values[rowIndex]]),
    ),
  );
}

function findCampaignRows(value: unknown, depth = 0): unknown[] | undefined {
  if (depth > 8) return undefined;

  if (typeof value === "string") {
    if (value.length > MAX_RESPONSE_TEXT_LENGTH) {
      throw new InvalidNexlaResponseError("The MCP response was too large.");
    }
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
    try {
      return findCampaignRows(JSON.parse(trimmed) as unknown, depth + 1);
    } catch {
      throw new InvalidNexlaResponseError("The MCP text result was not valid JSON.");
    }
  }

  if (Array.isArray(value)) {
    if (looksLikeCampaignRows(value)) return value;
    for (const item of value) {
      const rows = findCampaignRows(item, depth + 1);
      if (rows) return rows;
    }
    return undefined;
  }

  if (!isRecord(value)) return undefined;

  const columnRows = dataframeColumnRows(value);
  if (columnRows) return columnRows;

  for (const key of ["rows", "records", "results", "data", "output"]) {
    if (!(key in value)) continue;
    const candidate = value[key];
    if (Array.isArray(candidate) && candidate.length === 0) return [];
    const rows = findCampaignRows(candidate, depth + 1);
    if (rows) return rows;
  }

  for (const candidate of Object.values(value)) {
    const rows = findCampaignRows(candidate, depth + 1);
    if (rows) return rows;
  }
  return undefined;
}

function parseCampaignRows(result: unknown): CampaignSummaryRow[] {
  if (isRecord(result) && result.isError === true) {
    throw new NexlaToolError("Nexla reported a tool error.");
  }

  const rawRows = findCampaignRows(result);
  if (!rawRows?.length) throw new EmptyNexlaResponseError("No campaign rows returned.");
  if (rawRows.length !== EXPECTED_ROW_COUNT) {
    throw new InvalidNexlaResponseError("The campaign group count was unexpected.");
  }

  const expectedKeys = new Set([
    "campaign_id",
    "audience",
    "industry",
    "variant",
    "unique_contacts_sent",
    "positive_replies",
    "meetings_booked",
  ]);

  const parsed = rawRows.map((rawRow) => {
    if (!isRecord(rawRow)) {
      throw new InvalidNexlaResponseError("A campaign row was not an object.");
    }
    if (
      Object.keys(rawRow).length !== expectedKeys.size ||
      Object.keys(rawRow).some((key) => !expectedKeys.has(key))
    ) {
      throw new InvalidNexlaResponseError("A campaign row had unexpected fields.");
    }

    const row: CampaignSummaryRow = {
      campaign_id: normalizedText(rawRow.campaign_id, "campaign_id"),
      audience: normalizedText(rawRow.audience, "audience"),
      industry: normalizedText(rawRow.industry, "industry"),
      variant: normalizedText(rawRow.variant, "variant"),
      unique_contacts_sent: nonNegativeInteger(
        rawRow.unique_contacts_sent,
        "unique_contacts_sent",
      ),
      positive_replies: nonNegativeInteger(
        rawRow.positive_replies,
        "positive_replies",
      ),
      meetings_booked: nonNegativeInteger(
        rawRow.meetings_booked,
        "meetings_booked",
      ),
    };

    if (
      row.positive_replies > row.unique_contacts_sent ||
      row.meetings_booked > row.unique_contacts_sent
    ) {
      throw new InvalidNexlaResponseError("A campaign row had impossible counts.");
    }
    return row;
  });

  const groupKeys = new Set(
    parsed.map((row) =>
      [row.campaign_id, row.audience, row.industry, row.variant].join("\u0000"),
    ),
  );
  if (groupKeys.size !== parsed.length) {
    throw new InvalidNexlaResponseError("Duplicate campaign groups were returned.");
  }
  return parsed;
}

function sum(rows: CampaignSummaryRow[], key: keyof CampaignSummaryRow) {
  return rows.reduce((total, row) => total + Number(row[key]), 0);
}

function experiment(
  id: string,
  day: string,
  audience: string,
  message: string,
  sent: number,
  positive: number,
  meetings: number,
  verdict: ExperimentResult["verdict"],
  revealAfter: number,
): ExperimentResult {
  return {
    id,
    day,
    audience,
    message,
    sent,
    positive,
    meetings,
    rate: sent === 0 ? 0 : Number(((positive / sent) * 100).toFixed(1)),
    verdict,
    revealAfter,
  };
}

function toExperiments(rows: CampaignSummaryRow[]): ExperimentResult[] {
  const dayOne = rows.filter((row) => row.campaign_id === "TL-D1-COST");
  const dayTwo = rows.filter((row) => row.campaign_id === "TL-D2-AUDIT");
  const dayThreeA = rows.filter((row) => row.campaign_id === "TL-D3-A");
  const dayThreeB = rows.filter((row) => row.campaign_id === "TL-D3-B");

  if (
    dayOne.length !== 1 ||
    dayTwo.length !== 3 ||
    dayThreeA.length !== 1 ||
    dayThreeB.length !== 1
  ) {
    throw new InvalidNexlaResponseError("The expected experiment groups were missing.");
  }

  const experiments = [
    experiment(
      "day-1",
      "DAY 01",
      dayOne[0].audience,
      dayOne[0].variant,
      sum(dayOne, "unique_contacts_sent"),
      sum(dayOne, "positive_replies"),
      sum(dayOne, "meetings_booked"),
      "Rejected",
      0,
    ),
    experiment(
      "day-2",
      "DAY 02",
      dayTwo[0].audience,
      dayTwo[0].variant,
      sum(dayTwo, "unique_contacts_sent"),
      sum(dayTwo, "positive_replies"),
      sum(dayTwo, "meetings_booked"),
      "Promising",
      5,
    ),
    experiment(
      "day-3a",
      "DAY 03 · A",
      dayThreeA[0].audience.replace(/ leaders$/i, ""),
      dayThreeA[0].variant,
      sum(dayThreeA, "unique_contacts_sent"),
      sum(dayThreeA, "positive_replies"),
      sum(dayThreeA, "meetings_booked"),
      "Winner",
      9,
    ),
    experiment(
      "day-3b",
      "DAY 03 · B",
      dayThreeB[0].audience.replace(/ leaders$/i, ""),
      dayThreeB[0].variant,
      sum(dayThreeB, "unique_contacts_sent"),
      sum(dayThreeB, "positive_replies"),
      sum(dayThreeB, "meetings_booked"),
      "Retired",
      9,
    ),
  ];

  const totals = experiments.reduce(
    (current, item) => ({
      sent: current.sent + item.sent,
      positive: current.positive + item.positive,
      meetings: current.meetings + item.meetings,
    }),
    { sent: 0, positive: 0, meetings: 0 },
  );
  if (totals.sent !== 86 || totals.positive !== 16 || totals.meetings !== 8) {
    throw new InvalidNexlaResponseError("The governed campaign totals were unexpected.");
  }
  return experiments;
}

function mergedSignal(primary: AbortSignal, secondary?: AbortSignal | null) {
  if (!secondary) return primary;
  return AbortSignal.any([primary, secondary]);
}

function validEndpoint(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== NEXLA_HOSTNAME) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export async function resolveNexlaSignals(
  options: NexlaOptions = {},
): Promise<NexlaSignalResult> {
  if (options.forceDemo) return fallbackResult("forced-demo");
  if (configuredValue("NEXLA_LIVE_ENABLED")?.toLowerCase() !== "true") {
    return fallbackResult("disabled");
  }

  const endpoint = validEndpoint(configuredValue("NEXLA_MCP_URL"));
  const serviceKey = configuredValue("NEXLA_SERVICE_KEY");
  if (!endpoint || !serviceKey) return fallbackResult("missing-config");

  const startedAt = Date.now();
  const deadline = new AbortController();
  const timeout = setTimeout(() => deadline.abort(), REQUEST_TIMEOUT_MS);
  let client: { close(): Promise<void> } | undefined;

  try {
    // Lazy imports keep the server SDK out of module initialization and browser code.
    const [
      { Client },
      { StreamableHTTPClientTransport },
      { CfWorkerJsonSchemaValidator },
    ] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
      import("@modelcontextprotocol/sdk/validation/cfworker"),
    ]);
    const timedFetch: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: mergedSignal(deadline.signal, init?.signal),
      });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: {
        headers: { Authorization: `Bearer ${serviceKey}` },
      },
      fetch: timedFetch,
    });
    const mcpClient = new Client(
      { name: "signalloop", version: "0.1.0" },
      { jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
    );
    client = mcpClient;

    await mcpClient.connect(transport, {
      signal: deadline.signal,
      timeout: REQUEST_TIMEOUT_MS,
    });
    const result = await mcpClient.callTool(
      {
        name: TOOL_NAME,
        arguments: { query: CAMPAIGN_SUMMARY_QUERY, limit: 20 },
      },
      undefined,
      { signal: deadline.signal, timeout: REQUEST_TIMEOUT_MS },
    );
    const rows = parseCampaignRows(result);
    const experiments = toExperiments(rows);

    return {
      status: {
        provider: "Nexla",
        mode: "live-mcp",
        latencyMs: Date.now() - startedAt,
        rowCount: rows.length,
      },
      experiments,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    if (deadline.signal.aborted) return fallbackResult("timeout", latencyMs);
    if (error instanceof EmptyNexlaResponseError) {
      return fallbackResult("empty-data", latencyMs);
    }
    if (error instanceof InvalidNexlaResponseError) {
      return fallbackResult("invalid-response", latencyMs);
    }
    return fallbackResult("service-error", latencyMs);
  } finally {
    clearTimeout(timeout);
    await client?.close().catch(() => undefined);
  }
}
