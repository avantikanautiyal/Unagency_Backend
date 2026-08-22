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
  {
    suiteId: "phase5_task_graph",
    name: "Phase 5 Task Graph Executor",
    scenarioIds: ["task_graph_execution"],
    tags: ["phase5", "orchestration"],
  },
  {
    suiteId: "phase6_evaluation_governance",
    name: "Phase 6 Evaluation & Governance",
    scenarioIds: ["evaluation_governance"],
    tags: ["phase6", "governance", "evaluation"],
  },
  {
    suiteId: "phase7_refinement_delivery",
    name: "Phase 7 Structured Refinement & Delivery",
    scenarioIds: ["refinement_delivery"],
    tags: ["phase7", "refinement", "delivery"],
  },
  {
    suiteId: "phase8_production_runtime",
    name: "Phase 8 Production Runtime & Gateway",
    scenarioIds: ["phase8_production_runtime"],
    tags: ["phase8", "runtime", "queue", "gateway"],
  },
  {
    suiteId: "phase9_client_experience",
    name: "Phase 9 OS Client Experience",
    scenarioIds: ["phase9_client_experience"],
    tags: ["phase9", "client", "gateway"],
  },
];

export function getValidationSuite(suiteId: string): ValidationSuiteDefinition | undefined {
  return VALIDATION_SUITES.find((s) => s.suiteId === suiteId);
}
