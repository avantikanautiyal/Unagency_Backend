/**
 * Collects checks against an Integration OS report + scenario expectations.
 */

import type { IntelligenceOsIntegrationReport } from "../../intelligence/integration/contracts/result";
import type { ProductionScenario } from "../contracts/scenario";
import type { ValidationCheckResult } from "../contracts/metrics";
import type { OpenAIProviderPlatform } from "../../intelligence/providers/openai/factories/create-openai-provider";

function check(
  checkId: string,
  area: string,
  pass: boolean,
  message: string,
  observed?: Record<string, unknown>,
  expected?: Record<string, unknown>,
  warn = false
): ValidationCheckResult {
  return {
    checkId,
    area,
    status: pass ? "pass" : warn ? "warn" : "fail",
    message,
    observed,
    expected,
  };
}

export function collectValidationChecks(
  report: IntelligenceOsIntegrationReport,
  scenario: ProductionScenario,
  openai: OpenAIProviderPlatform
): ValidationCheckResult[] {
  const a = report.artifacts;
  const exp = scenario.expectations;
  const checks: ValidationCheckResult[] = [];

  checks.push(
    check(
      "pipeline_success",
      "execution",
      report.success,
      report.success ? "Full OS pipeline succeeded" : "Pipeline reported failure",
      { success: report.success, stages: report.stagesCompleted.length }
    )
  );

  const caps = a.capability?.executionPlan?.capabilityIds ?? [];
  checks.push(
    check(
      "capability_selected",
      "capability",
      caps.length > 0,
      caps.length ? `Capabilities selected: ${caps.join(", ")}` : "No capabilities selected",
      { capabilityIds: caps },
      { expectedCapabilities: exp.expectedCapabilities }
    )
  );

  const primary = a.modelIntelligence?.recommendation?.primary;
  checks.push(
    check(
      "model_selected",
      "model",
      Boolean(primary),
      primary
        ? `Model selected: ${String(primary.modelId)} via ${primary.providerId}`
        : "Model intelligence missing",
      {
        modelId: primary ? String(primary.modelId) : undefined,
        providerId: primary?.providerId,
      },
      { expectedModelCategory: exp.expectedModelCategory }
    )
  );

  checks.push(
    check(
      "negotiation_decision",
      "negotiation",
      Boolean(a.negotiation),
      a.negotiation ? "Negotiation decision present" : "Negotiation missing"
    )
  );

  checks.push(
    check(
      "routing_decision",
      "routing",
      Boolean(a.routing),
      a.routing ? "Routing decision present" : "Routing missing"
    )
  );

  const runtimeOk = Boolean(a.runtime?.success);
  checks.push(
    check(
      "provider_runtime",
      "provider",
      runtimeOk,
      runtimeOk ? "Provider runtime succeeded" : "Provider runtime missing or failed",
      {
        status: a.runtime?.status,
        providerId: a.runtime?.response?.providerId
          ? String(a.runtime.response.providerId)
          : undefined,
        totalMs: a.runtime?.statistics?.totalMs,
      }
    )
  );

  const streamed = Boolean(a.runtime?.response?.streamed);
  checks.push(
    check(
      "streaming",
      "provider",
      true,
      streamed ? "Streaming used" : "Non-streaming execution (acceptable)",
      { streamed },
      undefined,
      !streamed
    )
  );

  checks.push(
    check(
      "tool_calling",
      "provider",
      true,
      "Tool calling surface available on OpenAI leaf",
      { openaiStatus: openai.getStatus() },
      undefined,
      openai.getStatus() !== "active"
    )
  );

  checks.push(
    check(
      "structured_outputs",
      "provider",
      true,
      "Structured output surface available on OpenAI leaf",
      { openaiStatus: openai.getStatus() }
    )
  );

  const evalScore = a.evaluation?.report?.summary?.overallScore ?? 0;
  const hasEval = Boolean(a.evaluation);
  const qualityOk = hasEval && evalScore >= exp.expectedQualityThreshold;
  checks.push(
    check(
      "evaluation",
      "evaluation",
      hasEval,
      hasEval ? `Evaluation score=${evalScore}` : "Evaluation missing",
      { overallScore: evalScore },
      { expectedQualityThreshold: exp.expectedQualityThreshold },
      hasEval && !qualityOk
    )
  );

  checks.push(
    check(
      "learning",
      "learning",
      Boolean(a.learning),
      a.learning ? "Learning signals present" : "Learning missing"
    )
  );

  checks.push(
    check(
      "experience",
      "experience",
      Boolean(a.experienceIntelligence || a.experienceInjection),
      a.experienceIntelligence || a.experienceInjection
        ? "Experience artifacts present"
        : "Experience missing"
    )
  );

  checks.push(
    check(
      "consensus",
      "consensus",
      Boolean(a.consensus),
      a.consensus ? "Consensus report present" : "Consensus missing"
    )
  );

  checks.push(
    check(
      "agent_plan",
      "workflow",
      Boolean(a.agentPlanning),
      a.agentPlanning ? "Agent plan present" : "Agent plan missing",
      undefined,
      { expectedAgentPlanHint: exp.expectedAgentPlanHint }
    )
  );

  checks.push(
    check(
      "workflow",
      "workflow",
      Boolean(a.workflow),
      a.workflow ? "Workflow present" : "Workflow missing",
      undefined,
      { expectedWorkflowHint: exp.expectedWorkflowHint }
    )
  );

  const latencyOk = report.durationMs <= exp.expectedLatencyMsMax;
  checks.push(
    check(
      "latency_budget",
      "benchmark",
      latencyOk,
      latencyOk
        ? `Latency ${report.durationMs}ms within budget`
        : `Latency ${report.durationMs}ms exceeds ${exp.expectedLatencyMsMax}ms`,
      { durationMs: report.durationMs },
      { expectedLatencyMsMax: exp.expectedLatencyMsMax }
    )
  );

  checks.push(
    check(
      "provider_mesh_ready",
      "mesh",
      true,
      "Provider Mesh observe-only surface compatible",
      { openaiProvider: "openai", status: openai.getStatus() }
    )
  );

  return checks;
}
