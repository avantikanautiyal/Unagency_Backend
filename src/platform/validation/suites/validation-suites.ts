/**
 * Validation suite definitions.
 */

import type { ValidationScenarioId } from "../contracts/enums";
import { E2E_VALIDATION_SCENARIOS } from "../scenarios/end-to-end-scenarios";

export interface ValidationSuiteDefinition {
  readonly suiteId: string;
  readonly name: string;
  readonly scenarioIds: readonly ValidationScenarioId[];
  readonly tags: readonly string[];
}

export const VALIDATION_SUITES: readonly ValidationSuiteDefinition[] = [
  {
    suiteId: "full_e2e",
    name: "Full End-to-End",
    scenarioIds: E2E_VALIDATION_SCENARIOS.map((s) => s.scenarioId),
    tags: ["e2e", "production"],
  },
  {
    suiteId: "marketing_journeys",
    name: "Marketing Journeys",
    scenarioIds: ["campaign_generation", "landing_page"],
    tags: ["marketing"],
  },
  {
    suiteId: "creative_journeys",
    name: "Creative Journeys",
    scenarioIds: ["website_generation", "logo_generation"],
    tags: ["creative"],
  },
  {
    suiteId: "research_and_gateway",
    name: "Research & Gateway",
    scenarioIds: ["research_merge", "gateway_e2e"],
    tags: ["research", "gateway"],
  },
];

export function getValidationSuite(suiteId: string): ValidationSuiteDefinition | undefined {
  return VALIDATION_SUITES.find((s) => s.suiteId === suiteId);
}
