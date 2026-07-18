import type { ExperimentResult, LoopEvent, StrategySnapshot } from "./loop";

export interface SignalSource {
  name: "Nexla";
  observe(): Promise<ExperimentResult[]>;
}

export interface Strategist {
  name: "OpenAI" | "AWS Bedrock";
  propose(events: LoopEvent[]): Promise<StrategySnapshot>;
}

export interface CapabilityGateway {
  name: "Zero";
  discover(capability: string): Promise<unknown>;
}

export interface ProtectedAction {
  name: "Pomerium";
  invoke(request: Request): Promise<Response>;
}

export const sponsorRoles = [
  { name: "OpenAI", role: "reasoning", state: "billing blocked" },
  { name: "Nexla", role: "signals", state: "MCP ready" },
  { name: "Zero", role: "capability discovery", state: "live discovery" },
  { name: "Pomerium", role: "policy", state: "tunnel only" },
] as const;
