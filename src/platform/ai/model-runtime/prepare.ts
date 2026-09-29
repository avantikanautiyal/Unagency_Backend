/**
 * Phase 11/12 — Prepare CanonicalModelRequest for provider transport.
 *
 * Representation only: capability plan + compatibility flatten.
 * Does NOT resolve artifacts, requirements, references, WM, Spec, or attachments.
 * Does NOT mutate the CanonicalModelRequest object.
 */

import type { CanonicalModelRequest } from "../canonical-model-request";
import { mapCanonicalModelRequestToProviderPayload } from "../canonical-model-request";
import { assessCmrProviderRepresentation } from "./capability";
import { summarizeRepresentationPlan } from "./representation-plan";
import {
  emitModelRuntimeFailedTrace,
  emitModelRuntimeMappedTrace,
} from "./trace";
import {
  MODEL_RUNTIME_SOURCE,
  type ModelRuntimePrepareInput,
  type ModelRuntimePrepareResult,
  type ModelRuntimeProjection,
} from "./types";

function countUpstreamArtifacts(modelRequest: CanonicalModelRequest): {
  count: number;
  versions: string[];
} {
  const versions: string[] = [];
  for (const m of modelRequest.messages) {
    for (const p of m.content) {
      if (p.type !== "structured" || p.name !== "upstream_artifact") continue;
      const data = p.data as { artifactId?: unknown; version?: unknown };
      const id = typeof data.artifactId === "string" ? data.artifactId : "";
      const v = typeof data.version === "number" ? data.version : undefined;
      if (id && v !== undefined) versions.push(`${id}@${v}`);
    }
  }
  return { count: versions.length, versions };
}

function countMultimodalItems(modelRequest: CanonicalModelRequest): number {
  for (const m of modelRequest.messages) {
    for (const p of m.content) {
      if (p.type !== "structured" || p.name !== "multimodal_context") continue;
      const data = p.data as { items?: unknown };
      return Array.isArray(data.items) ? data.items.length : 0;
    }
  }
  return 0;
}

/**
 * Project CMR through the provider-neutral runtime + Phase 12 representation plan.
 */
export function prepareCanonicalModelRuntime(
  input: ModelRuntimePrepareInput,
): ModelRuntimePrepareResult {
  const modelRequest = input.modelRequest;
  const assessed = assessCmrProviderRepresentation(modelRequest, {
    providerId: input.providerId,
    modelId: input.modelId,
  });
  const plan = assessed.plan;
  const planSummary = summarizeRepresentationPlan(plan);

  const metadataStamps: Record<string, unknown> = {
    ...planSummary,
    modelRuntimeApplied: true,
    modelRuntimeSource: MODEL_RUNTIME_SOURCE,
    modelRuntimeRepresentationStrategy: plan.representationStrategy,
    modelRuntimeMappedCount: assessed.mappedCount,
    modelRuntimeOmittedCount: assessed.omittedCount,
    capabilityAssessmentApplied: true,
  };

  if (plan.requiredUnrepresentableCount > 0) {
    const blockers = plan.components.filter(
      (c) => c.status === "REQUIRED_BUT_UNREPRESENTABLE",
    );
    const message = `Required CMR context cannot be represented for provider: ${blockers
      .map((b) => `${b.component} (${b.reason ?? "unrepresentable"})`)
      .join("; ")}`;
    emitModelRuntimeFailedTrace({
      executionId: input.executionId,
      failureCategory: "REQUIRED_BUT_UNREPRESENTABLE",
      messageSafe: message,
    });
    return {
      ok: false,
      code: "REQUIRED_BUT_UNREPRESENTABLE",
      message,
      plan,
      metadataStamps,
    };
  }

  const projection = mapCanonicalModelRequestToProviderPayload(modelRequest, {
    multimodalProviderMappedCount: assessed.mappedCount,
    multimodalProviderOmittedCount: assessed.omittedCount,
  });

  const runtime: ModelRuntimeProjection = {
    applied: true,
    source: MODEL_RUNTIME_SOURCE,
    representationStrategy: "cmr_compatibility_flatten",
    projection,
    modelRequest,
    capabilities: plan.capabilities,
    mappedCount: assessed.mappedCount,
    omittedCount: assessed.omittedCount,
  };

  const upstream = countUpstreamArtifacts(modelRequest);
  const productionSpecPresent = plan.components.some(
    (c) => c.component === "production_spec" && c.presentInCmr,
  );
  const outputContractPresent = plan.components.some(
    (c) =>
      (c.component === "output_contract" ||
        c.component === "output_requirements") &&
      c.presentInCmr,
  );

  const successStamps: Record<string, unknown> = {
    ...metadataStamps,
    flattenedByProvider: true,
    canonicalModelRequestApplied: true,
    messageCount: projection.messageCount,
    contentPartCount: projection.contentPartCount,
    structuredPartCount: projection.structuredPartCount,
    productionSpecPresent:
      input.metadata?.cdfCanonicalProductionSpecPresent === true ||
      productionSpecPresent,
    outputContractPresent:
      input.metadata?.cdfCanonicalOutputRequirementsPresent === true ||
      outputContractPresent,
  };

  const meta = input.metadata ?? {};
  emitModelRuntimeMappedTrace({
    executionId: input.executionId,
    correlationId: input.correlationId,
    apiExecutionId:
      typeof meta.apiExecutionId === "string" ? meta.apiExecutionId : undefined,
    cdfSessionId:
      typeof meta.cdfSessionId === "string" ? meta.cdfSessionId : undefined,
    cdfPhaseId: typeof meta.cdfPhaseId === "string" ? meta.cdfPhaseId : undefined,
    generationContextHash:
      typeof meta.cdfCanonicalContextHash === "string"
        ? meta.cdfCanonicalContextHash
        : modelRequest.metadata?.generationContextHash,
    providerId: input.providerId,
    modelId: input.modelId,
    representationStrategy: runtime.representationStrategy,
    cmrPresent: true,
    messageCount: projection.messageCount,
    contentPartCount: projection.contentPartCount,
    multimodalItemCount: countMultimodalItems(modelRequest),
    upstreamArtifactCount: upstream.count,
    artifactVersions: upstream.versions,
    outputContractPresent,
    productionSpecPresent,
    compatibilityFlattenOccurred: true,
    mappedCount: assessed.mappedCount,
    omittedCount: assessed.omittedCount,
    capabilityAssessmentApplied: true,
    supportedCount: plan.supportedCount,
    compatibilityCount: plan.compatibilityCount,
    requiredUnrepresentableCount: plan.requiredUnrepresentableCount,
    componentNames: plan.componentNames,
    capabilityStatuses: plan.capabilityStatuses,
    providerFamily: plan.providerFamily,
  });

  return {
    ok: true,
    runtime,
    prompt: projection.prompt,
    metadataStamps: successStamps,
    plan,
  };
}

/**
 * Assert CMR object identity is preserved across runtime prepare
 * (flatten must not mutate semantic CMR).
 */
export function assertModelRequestUnchanged(
  before: CanonicalModelRequest,
  after: CanonicalModelRequest,
): boolean {
  return before === after;
}
