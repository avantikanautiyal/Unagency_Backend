/**
 * Output Contract Validation Engine — executes Step 1 contracts against actual output.
 */

import {
  defaultServiceOutputContractRegistry,
  brandRequirementsFromContext,
  userTaskRequirementsFromBrief,
} from "../../contracts/output-contracts";
import { userTaskRequirementsFromExecutionSpec } from "../../../collaboration/conversational-task-intelligence/deliverable-compliance";
import type { CanonicalExecutionSpecification } from "../../../collaboration/conversational-task-intelligence/execution-specification";
import type { EffectiveOutputContract } from "../../contracts/output-contracts/types";
import type { QualityDimension } from "../../contracts/output-contracts/evaluation-methods";
import {
  buildArtifactContext,
  contractFormats,
  type ValidationArtifactContext,
  type ValidationArtifactRef,
} from "./artifact-context";
import { dispatchRequirementValidation } from "./method-dispatcher";
import {
  applyQualityGate,
  buildFailureSummary,
  buildRepairInfo,
  summarizeHardRequirements,
  summarizeQualityDimensions,
  type QualityGatePolicy,
} from "./quality-gate";
import {
  evaluateSemanticQualityDimension,
} from "./validators/semantic-evaluator";
import {
  evaluateVisualQualityDimension,
} from "./validators/visual-evaluator";
import {
  evaluateAccessibilityQualityDimension,
  evaluatePerformanceQualityDimension,
  evaluateSeoQualityDimension,
  evaluateBrandAdherenceQualityDimension,
  evaluateVisualHierarchyQualityDimension,
} from "./validators/artifact-quality-evaluator";
import type { ArtifactEvaluationBundle } from "../artifact-evaluation/types";
import { ARTIFACT_EVALUATION_VERSION, ARTIFACT_EVALUATOR_ID } from "../artifact-evaluation/artifact-evaluation-version";
import {
  EVALUATION_PLANE_ID,
  EVALUATION_PLANE_VERSION,
} from "../evaluation-plane/evaluation-plane-version";
import type {
  OutputValidationResult,
  RequirementValidationResult,
  QualityDimensionValidationResult,
} from "./validation-result";
import {
  OUTPUT_VALIDATION_VERSION,
  OUTPUT_VALIDATOR_RUNTIME_VERSION,
} from "./validation-result";

export type ValidateOutputContractInput = {
  readonly organizationId: string;
  readonly executionId: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly platform?: string;
  readonly format?: string;
  readonly industry?: string;
  readonly preview: string;
  readonly briefObjective?: string;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[];
  readonly artifactRefs?: readonly ValidationArtifactRef[];
  readonly outputKind?: string;
  readonly mockupRole?: string;
  readonly expectedAspectRatio?: string;
  readonly actualAspectRatio?: string;
  readonly actualModality?: string;
  readonly brandAvoidTerms?: readonly string[];
  readonly brandPreferredTerms?: readonly string[];
  readonly brandColors?: readonly string[];
  readonly boundLogoAssetId?: string;
  readonly brandVoice?: string;
  readonly buildSucceeded?: boolean;
  readonly buildOutput?: string;
  readonly runtimeErrors?: readonly string[];
  readonly artifactEvaluation?: ArtifactEvaluationBundle;
  readonly effectiveContract?: EffectiveOutputContract;
  readonly qualityGatePolicy?: QualityGatePolicy;
  /** P4.6 — resolved execution specification for deliverable compliance. */
  readonly executionSpec?: CanonicalExecutionSpecification;
  readonly nowIso?: () => string;
  readonly createId?: (prefix: string) => string;
};

/** Idempotency cache — same execution+contract+validator → same result. */
const validationCache = new Map<string, OutputValidationResult>();

function cacheKey(input: ValidateOutputContractInput, contract: EffectiveOutputContract): string {
  return [
    input.executionId,
    contract.identity?.effectiveContractId ?? contract.contractId,
    contract.version,
    OUTPUT_VALIDATOR_RUNTIME_VERSION,
    input.preview.slice(0, 200),
    (input.mediaArtifactIds ?? []).join(","),
  ].join("|");
}

function evaluateQualityDimension(
  dim: QualityDimension,
  ctx: ValidationArtifactContext,
  briefObjective?: string,
): QualityDimensionValidationResult {
  switch (dim.evaluationMethod) {
    case "semantic_evaluator":
      return evaluateSemanticQualityDimension(dim, ctx, briefObjective);
    case "visual_evaluator":
      return evaluateVisualQualityDimension(dim, ctx);
    case "static_analysis":
      if (dim.id.includes("seo")) return evaluateSeoQualityDimension(dim, ctx);
      return evaluateVisualQualityDimension(dim, ctx);
    case "accessibility_tooling":
      return evaluateAccessibilityQualityDimension(dim, ctx);
    case "performance_tooling":
      return evaluatePerformanceQualityDimension(dim, ctx);
    default:
      if (dim.id.includes("brand")) {
        return evaluateBrandAdherenceQualityDimension(dim, ctx);
      }
      if (dim.id.includes("hierarchy")) {
        return evaluateVisualHierarchyQualityDimension(dim, ctx);
      }
      return Object.freeze({
        dimensionId: dim.id,
        label: dim.label,
        score: 0,
        threshold: dim.threshold,
        weight: dim.weight ?? 1,
        weightedContribution: 0,
        status: "NOT_AUTOMATED" as const,
        evidence: Object.freeze([
          `quality dimension method ${dim.evaluationMethod} not automated`,
        ]),
        evaluatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
        evaluationMethod: dim.evaluationMethod,
      });
  }
}

function executeDefinitionOfDone(
  contract: EffectiveOutputContract,
  requirementResults: readonly RequirementValidationResult[],
): OutputValidationResult["definitionOfDone"] {
  const byId = new Map(requirementResults.map((r) => [r.requirementId, r]));
  const allChecks = [
    ...contract.definitionOfDone.mandatoryChecks,
    ...contract.definitionOfDone.deliveryChecks,
  ];
  return Object.freeze(
    allChecks.map((checkId) => {
      const match = byId.get(checkId);
      return Object.freeze({
        checkId,
        status: match?.status ?? ("UNVERIFIED" as const),
        evidence: match?.evidence ?? Object.freeze([`no validator mapped for DoD check ${checkId}`]),
      });
    }),
  );
}

export function validateOutputContract(
  input: ValidateOutputContractInput,
): OutputValidationResult | undefined {
  const start = Date.now();
  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);

  if (!input.service || !input.subtype) {
    return undefined;
  }

  const brandReqs = brandRequirementsFromContext({
    avoidTerms: input.brandAvoidTerms,
    preferredTerms: input.brandPreferredTerms,
    colors: input.brandColors,
    logoAssetId: input.boundLogoAssetId,
    voice: input.brandVoice,
  });
  const userReqsFromBrief = userTaskRequirementsFromBrief({
    prompt: input.briefObjective,
  });
  const userReqsFromSpec = input.executionSpec
    ? userTaskRequirementsFromExecutionSpec(input.executionSpec)
    : [];
  const userReqs = Object.freeze([...userReqsFromBrief, ...userReqsFromSpec]);

  const contract =
    input.effectiveContract ??
    defaultServiceOutputContractRegistry.composeEffectiveContract({
      service: input.service,
      subtype: input.subtype,
      platform: input.platform,
      format: input.format,
      industry: input.industry,
      brandRequirements: brandReqs,
      userTaskRequirements: userReqs,
    });

  if (!contract) return undefined;

  const cached = validationCache.get(cacheKey(input, contract));
  if (cached) return cached;

  const ctx = buildArtifactContext({
    preview: input.preview,
    structuredData: input.structuredData,
    mediaArtifactIds: input.mediaArtifactIds,
    artifactRefs: input.artifactRefs,
    outputKind: input.outputKind ?? contract.outputKind,
    mockupRole: input.mockupRole ?? contract.mockupRole,
    expectedAspectRatio: input.expectedAspectRatio,
    actualAspectRatio: input.actualAspectRatio,
    actualModality: input.actualModality,
    supportedDownloadFormats: contractFormats(contract),
    buildSucceeded: input.buildSucceeded,
    buildOutput: input.buildOutput,
    runtimeErrors: input.runtimeErrors,
    artifactEvaluation: input.artifactEvaluation,
  });

  const requirementResults: RequirementValidationResult[] =
    contract.hardRequirements.map((req) =>
      dispatchRequirementValidation({
        requirement: req,
        ctx,
        contract,
        briefObjective: input.briefObjective,
      }),
    );

  const qualityResults: QualityDimensionValidationResult[] =
    contract.qualityRequirements.map((dim) =>
      evaluateQualityDimension(dim, ctx, input.briefObjective),
    );

  const hardSummary = summarizeHardRequirements(requirementResults);
  const qualitySummary = summarizeQualityDimensions(qualityResults);
  const gate = applyQualityGate({
    hardSummary,
    qualitySummary,
    requirements: requirementResults,
    policy: input.qualityGatePolicy,
  });

  const result: OutputValidationResult = Object.freeze({
    validationId: createId("oval"),
    version: OUTPUT_VALIDATION_VERSION,
    executionId: input.executionId,
    organizationId: input.organizationId,
    contractId: contract.contractId,
    contractVersion: contract.version,
    effectiveContractId: contract.identity?.effectiveContractId,
    status: gate.status,
    requirements: Object.freeze(requirementResults),
    qualityDimensions: Object.freeze(qualityResults),
    hardRequirementSummary: hardSummary,
    qualitySummary,
    failureSummary: buildFailureSummary(requirementResults),
    definitionOfDone: executeDefinitionOfDone(contract, requirementResults),
    overallScore: qualitySummary.overallScore,
    completionAllowed: gate.completionAllowed,
    validatedAt: nowIso(),
    validatorVersion: OUTPUT_VALIDATOR_RUNTIME_VERSION,
    provenance: Object.freeze([
      { field: "contractId", value: contract.contractId, source: "CONTRACT" as const },
      {
        field: "effectiveContractId",
        value: contract.identity?.effectiveContractId ?? contract.contractId,
        source: "CONTRACT" as const,
      },
      { field: "contractVersion", value: contract.version, source: "CONTRACT" as const },
      { field: "outputKind", value: contract.outputKind, source: "CONTRACT" as const },
      { field: "gateReason", value: gate.reason, source: "VALIDATOR" as const },
      ...(input.artifactEvaluation
        ? [
            {
              field: "artifactEvaluatorId",
              value: ARTIFACT_EVALUATOR_ID,
              source: "VALIDATOR" as const,
            },
            {
              field: "artifactEvaluatorVersion",
              value: ARTIFACT_EVALUATION_VERSION,
              source: "VALIDATOR" as const,
            },
            ...(input.artifactEvaluation.provenance.some(
              (p) => p.evaluatorId === EVALUATION_PLANE_ID,
            )
              ? [
                  {
                    field: "evaluationPlaneId",
                    value: EVALUATION_PLANE_ID,
                    source: "VALIDATOR" as const,
                  },
                  {
                    field: "evaluationPlaneVersion",
                    value: EVALUATION_PLANE_VERSION,
                    source: "VALIDATOR" as const,
                  },
                ]
              : []),
          ]
        : []),
    ]),
    durationMs: Date.now() - start,
  });

  validationCache.set(cacheKey(input, contract), result);
  return result;
}

export function clearValidationCache(): void {
  validationCache.clear();
}

export { buildRepairInfo };

export class OutputContractValidationEngine {
  validate(input: ValidateOutputContractInput): OutputValidationResult | undefined {
    return validateOutputContract(input);
  }
}

export const defaultOutputContractValidationEngine =
  new OutputContractValidationEngine();
