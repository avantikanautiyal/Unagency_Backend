/**
 * Failure analysis — no automatic repair.
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { FailureAnalysis, ValidationCheckResult } from "../contracts/metrics";

const STAGE_TO_MODULE: Record<string, string> = {
  task_intelligence: "Task Intelligence",
  capability_intelligence: "Capability Intelligence",
  agent_planning: "Agent Planning",
  workflow_intelligence: "Workflow Intelligence",
  execution_governance: "Execution Governance",
  experience_injection: "Experience Injection",
  execution_intelligence: "Execution Intelligence",
  model_intelligence: "Model Intelligence",
  negotiation: "Negotiation",
  routing: "Routing",
  provider_runtime: "Provider Runtime / OpenAI",
  consensus: "Consensus",
  evaluation: "Evaluation",
  learning: "Learning",
  experience_intelligence: "Experience Intelligence",
};

export function analyzeFailure(
  report: IntelligenceOsIntegrationReport | undefined,
  checks: readonly ValidationCheckResult[]
): FailureAnalysis {
  const failedChecks = checks.filter((c) => c.status === "fail");
  if ((!report || report.success) && failedChecks.length === 0) {
    return { failed: false };
  }

  const stageFailure = report?.trace.failedStage ?? failedChecks[0]?.area;
  const responsibleModule =
    (stageFailure && STAGE_TO_MODULE[stageFailure]) ||
    failedChecks[0]?.area ||
    "Unknown";

  const rootCause = report?.trace.failedStage
    ? `Pipeline failed at stage ${report.trace.failedStage}`
    : failedChecks.map((c) => c.message).join("; ") || "Validation checks failed";

  return {
    failed: true,
    rootCause,
    stageFailure: stageFailure ? String(stageFailure) : undefined,
    responsibleModule,
    suggestedFix:
      "Inspect stage artifacts and bridge observability; fix configuration or inputs. No automatic repair applied.",
    severity: report && !report.success ? "critical" : failedChecks.length > 3 ? "major" : "minor",
    details: failedChecks.map((c) => `${c.checkId}: ${c.message}`),
  };
}
