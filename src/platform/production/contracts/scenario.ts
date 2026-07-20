/**
 * Scenario library contracts — expected outcomes for deterministic validation.
 */

import type { ScenarioDomain } from "./enums";

export interface ScenarioExpectations {
  readonly expectedCapabilities: readonly string[];
  readonly expectedWorkflowHint: string;
  readonly expectedAgentPlanHint: string;
  readonly expectedModelCategory: string;
  readonly expectedQualityThreshold: number;
  readonly expectedLatencyMsMax: number;
  readonly expectedCostMin: number;
  readonly expectedCostMax: number;
}

export interface ProductionScenario {
  readonly scenarioId: string;
  readonly domain: ScenarioDomain;
  readonly name: string;
  readonly businessPrompt: string;
  readonly expectations: ScenarioExpectations;
  readonly tags: readonly string[];
}
