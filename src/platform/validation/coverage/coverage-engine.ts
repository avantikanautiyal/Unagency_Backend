/**
 * Coverage engine — tracks validated scenarios, stages, APIs, modules.
 */

import type { CoverageSummary, ValidationRunReport } from "../contracts";
import { E2E_VALIDATION_SCENARIOS } from "../scenarios/end-to-end-scenarios";

const MODULES_CONSUMED = [
  "Intelligence OS (via production validation)",
  "Enterprise API Gateway",
  "Brand Brain",
  "Knowledge Intelligence",
  "Execution Intelligence APIs",
  "Business Platform",
  "Observability",
  "Production Validation Framework",
] as const;

const API_PATHS_COVERED = [
  "POST /v1/auth/login",
  "POST /v1/executions",
  "GET /v1/executions/{id}",
  "GET /v1/executions/{id}/model-decision",
  "GET /v1/executions/{id}/routing",
  "GET /v1/executions/{id}/planning",
  "GET /v1/executions/{id}/timeline",
  "GET /v1/executions/{id}/provider",
  "GET /v1/executions/{id}/metrics",
  "GET /v1/executions/{id}/tokens",
  "GET /v1/executions/{id}/cost-breakdown",
  "GET /v1/executions/{id}/quality",
  "GET /v1/executions/{id}/confidence",
  "GET /v1/executions/{id}/audit",
  "GET /v1/executions/{id}/decision-graph",
  "GET /v1/capabilities",
  "GET /v1/providers",
  "GET /v1/models",
] as const;

export function buildCoverageSummary(report: Partial<ValidationRunReport>): CoverageSummary {
  const scenarios = report.scenarios ?? [];
  const passed = scenarios.filter((s) => s.success).length;
  const stagesTotal = E2E_VALIDATION_SCENARIOS.reduce((n, s) => n + s.stages.length, 0);
  const stagesValidated = scenarios.reduce((n, s) => n + s.stages.length, 0);
  return {
    scenariosTotal: E2E_VALIDATION_SCENARIOS.length,
    scenariosPassed: passed,
    stagesTotal,
    stagesValidated,
    apisCovered: [...API_PATHS_COVERED],
    modulesConsumed: [...MODULES_CONSUMED],
  };
}
