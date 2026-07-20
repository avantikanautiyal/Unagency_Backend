/**
 * Evaluation strategy resolver — capability/industry/risk → strategy.
 */

import { success, type Result } from "../../shared/result";
import type { DynamicEvaluationRequest, DynamicEvaluationStrategy, EvaluationPipelineFamily, EvaluationObjectiveKind, EvaluationRiskLevel } from "../contracts/dynamic-evaluation";
import type { IEvaluationStrategyResolver } from "../interfaces/dynamic-evaluation-ports";
import { pipelineFamilyForCapability } from "../capability-profiles/capability-pipeline-hints";
import { pipelineFamilyForIndustry } from "../industry-profiles/industry-pipeline-hints";

const DYNAMIC_EVAL_VERSION = "1.0.0";

export class DefaultEvaluationStrategyResolver implements IEvaluationStrategyResolver {
  resolve(request: DynamicEvaluationRequest): Result<DynamicEvaluationStrategy> {
    const text = gatherText(request);
    const family = resolveFamily(text, request);
    const risk = resolveRisk(text, request, family);
    const humanApprovalRequired =
      risk === "high" ||
      risk === "critical" ||
      family === "healthcare" ||
      family === "legal" ||
      Boolean(request.inputs.governancePlan?.decision.kind === "pending_approval") ||
      Boolean(request.inputs.governancePlan?.decision.kind === "escalated");

    const capability =
      request.inputs.capabilityPlan?.capabilityIds[0] ??
      String(request.identity.capabilityId ?? inferCapability(family, text));

    const industry =
      request.inputs.context?.industryHint ??
      inferIndustry(family, text);

    const objective = resolveObjective(family);
    const experienceSignalCount =
      request.inputs.experiencePackage?.relevantExperiences.length ??
      request.inputs.experiencePackage?.topN ??
      0;

    const historicalSuccessRate = meanHistoricalSuccess(request);

    return success({
      strategyId: `strat_${family}_${risk}`,
      objective,
      pipelineFamily: family,
      capability,
      industry,
      workflowType:
        request.inputs.context?.workflowTypeHint ??
        request.inputs.workflowPlan?.name ??
        "default",
      outputType: request.inputs.context?.outputTypeHint ?? inferOutputType(text, family),
      riskLevel: risk,
      complianceLevel: family === "healthcare" || family === "legal" ? "strict" : "standard",
      humanApprovalRequired,
      historicalSuccessRate,
      experienceSignalCount,
      benchmarkProfileId: `bench_${family}_${risk}`,
      rationale: `Resolved ${family} evaluation pipeline for capability=${capability}, industry=${industry}, risk=${risk}.`,
      version: DYNAMIC_EVAL_VERSION,
    });
  }
}

function gatherText(request: DynamicEvaluationRequest): string {
  const parts = [
    JSON.stringify(request.inputs.executionResult.output ?? {}),
    ...(request.inputs.capabilityPlan?.capabilityIds ?? []),
    request.inputs.context?.capabilityHints?.join(" ") ?? "",
    request.inputs.context?.industryHint ?? "",
    request.inputs.context?.departmentHint ?? "",
    request.inputs.taskPlan?.planId ?? "",
    ...(request.inputs.humanFeedback ?? []),
  ];
  return parts.join(" ").toLowerCase();
}

function resolveFamily(
  text: string,
  request: DynamicEvaluationRequest
): EvaluationPipelineFamily {
  for (const id of request.inputs.capabilityPlan?.capabilityIds ?? []) {
    const hint = pipelineFamilyForCapability(id);
    if (hint) return hint;
  }
  for (const id of request.inputs.context?.capabilityHints ?? []) {
    const hint = pipelineFamilyForCapability(id);
    if (hint) return hint;
  }
  if (request.inputs.context?.industryHint) {
    const hint = pipelineFamilyForIndustry(request.inputs.context.industryHint);
    if (hint) return hint;
  }

  const hints = [
    text,
    request.inputs.context?.departmentHint?.toLowerCase() ?? "",
    ...(request.inputs.capabilityPlan?.capabilityIds ?? []).map((c) => c.toLowerCase()),
  ].join(" ");

  if (/medical|healthcare|clinical|diagnosis|patient/.test(hints)) {
    return "healthcare";
  }
  if (/legal|contract|clause|liability/.test(hints)) return "legal";
  if (/finance|forecast|budget|revenue/.test(hints)) return "finance";
  if (
    /react native|nodejs|node\.js|backend|software|code|architecture|api|typescript|flutter/.test(
      hints
    )
  ) {
    return "software";
  }
  if (/research|paper|citation/.test(hints)) return "research";
  if (/video|audio|image generation|media/.test(hints)) return "media";
  if (
    /marketing|carousel|instagram|social|copywriting|email campaign|creative/.test(hints)
  ) {
    return "marketing";
  }
  return "general";
}

function resolveRisk(
  text: string,
  request: DynamicEvaluationRequest,
  family: EvaluationPipelineFamily
): EvaluationRiskLevel {
  if (request.inputs.context?.riskLevel) return request.inputs.context.riskLevel;
  if (family === "healthcare" || family === "legal") return "high";
  if (family === "finance") return "medium";
  if (/unsafe|critical|pii|hipaa/.test(text)) return "critical";
  if (request.inputs.executionResult.success === false) return "high";
  return family === "software" ? "medium" : "low";
}

function resolveObjective(family: EvaluationPipelineFamily): EvaluationObjectiveKind {
  switch (family) {
    case "marketing":
    case "media":
      return "creative";
    case "software":
      return "technical";
    case "healthcare":
    case "legal":
      return "compliance";
    case "research":
      return "quality";
    default:
      return "mixed";
  }
}

function inferCapability(family: EvaluationPipelineFamily, text: string): string {
  if (family === "marketing" && /carousel/.test(text)) return "marketing.social.carousel";
  if (family === "software" && /react native/.test(text)) return "software.code_generation";
  if (family === "healthcare") return "healthcare.report";
  return `capability.${family}`;
}

function inferIndustry(family: EvaluationPipelineFamily, text: string): string {
  if (/retail|sneaker/.test(text)) return "retail";
  if (family === "healthcare") return "healthcare";
  if (family === "software") return "technology";
  if (family === "marketing") return "consumer";
  return family;
}

function inferOutputType(text: string, family: EvaluationPipelineFamily): string {
  if (/carousel|instagram/.test(text)) return "social_carousel";
  if (/react native|app/.test(text)) return "mobile_app";
  if (/medical report|clinical/.test(text)) return "medical_report";
  return family === "software" ? "code" : "document";
}

function meanHistoricalSuccess(request: DynamicEvaluationRequest): number | undefined {
  const reports = request.inputs.historicalReports;
  if (!reports?.length) return undefined;
  const sum = reports.reduce((s, r) => s + r.summary.overallScore, 0);
  return sum / reports.length;
}
