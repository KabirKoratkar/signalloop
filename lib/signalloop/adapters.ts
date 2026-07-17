import type { ExperimentResult, LoopEvent, StrategySnapshot } from "./loop";

export interface SignalSource {
  name: "Nexla";
  observe(): Promise<ExperimentResult[]>;
}

export interface Strategist {
  name: "AWS Bedrock";
  propose(events: LoopEvent[]): Promise<StrategySnapshot>;
}

export interface CapabilityGateway {
  name: "Zero";
  discoverAndRun(capability: string, input: unknown): Promise<unknown>;
}

export interface ProtectedAction {
  name: "Pomerium";
  invoke(request: Request): Promise<Response>;
}

export const sponsorRoles = [
  { name: "AWS Bedrock", role: "reasoning", state: "live-ready" },
  { name: "Nexla", role: "signals", state: "demo adapter" },
  { name: "Zero", role: "action", state: "demo adapter" },
  { name: "Pomerium", role: "policy", state: "policy modeled" },
] as const;
