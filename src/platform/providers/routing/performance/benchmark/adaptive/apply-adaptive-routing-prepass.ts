/**
 * Step 12 — Apply adaptive routing decision to prepass metadata (single routing path).
 */

import type { CreateExecutionRequest } from "../../../../../api/contracts";
import { resolveAdaptiveRoutingDecision } from "./adaptive-routing-decision-service";
import type { AdaptiveRoutingDecisionServiceDeps } from "./adaptive-routing-decision-service";
import type { ProductionRoutingMetadata } from "./adaptive-routing-decision-contract";
import { logAdaptiveRoutingExecution } from "./adaptive-routing-logger";

export type AdaptiveRoutingPrepassDeps = AdaptiveRoutingDecisionServiceDeps;

export type ApplyAdaptiveRoutingInput = {
  readonly workingMetadata: Readonly<Record<string, unknown>>;
  readonly req: CreateExecutionRequest;
  readonly capabilityId: string;
  readonly organizationId: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly createId: (prefix: string) => string;
  readonly nowIso: () => string;
  readonly deps?: AdaptiveRoutingPrepassDeps;
};

export type ApplyAdaptiveRoutingResult = {
  readonly workingMetadata: Readonly<Record<string, unknown>>;
  readonly req: CreateExecutionRequest;
  readonly routingMetadata: ProductionRoutingMetadata;
  readonly staticProviderId: string;
  readonly staticModelId: string;
};

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export async function applyAdaptiveRoutingToPrepass(
  input: ApplyAdaptiveRoutingInput,
): Promise<ApplyAdaptiveRoutingResult> {
  const meta = input.workingMetadata;
  const staticProviderId =
    readString(meta.preferredProviderId) ?? readString(input.req.providerId) ?? "provider.unknown";
  const staticModelId =
    readString(meta.preferredModelId) ?? readString(input.req.modelId) ?? "unknown";
  const service = readString(meta.service);
  const subtype = readString(meta.subtype);

  const routingMetadata: ProductionRoutingMetadata = Object.freeze({
    routingMode: "static",
    adaptiveSelected: false,
  });

  if (!service || !subtype) {
    return Object.freeze({
      workingMetadata: meta,
      req: input.req,
      routingMetadata,
      staticProviderId,
      staticModelId,
    });
  }

  const decision = await resolveAdaptiveRoutingDecision(
    Object.freeze({
      requestId: input.requestId,
      executionId: input.executionId,
      organizationId: input.organizationId,
      capabilityId: input.capabilityId,
      scope: Object.freeze({
        service,
        subtype,
        industry: readString(meta.industry),
        platform: readString(meta.platform),
        format: readString(meta.format),
      }),
      actual: Object.freeze({
        providerId: staticProviderId,
        modelId: staticModelId,
        strategyId: readString(meta.strategyId) ?? "strategy.baseline",
        strategyVersion: readString(meta.strategyVersion) ?? "1.0.0",
        knowledgeId: readString(meta.knowledgeId),
        knowledgeVersion: readString(meta.knowledgeVersion),
      }),
      outputKind: readString(meta.outputKind),
    }),
    {
      ...input.deps,
      createId: input.createId,
      nowIso: input.nowIso,
    },
  );

  const nextRouting: ProductionRoutingMetadata = Object.freeze({
    routingMode: decision.routingMode,
    routingPolicyId: decision.provenance.routingPolicyId,
    routingPolicyVersion: decision.provenance.routingPolicyVersion,
    adaptiveDecisionId: decision.decisionId,
    adaptiveSelected: decision.decision === "USE_ADAPTIVE",
    fallbackUsed: false,
    correlationId: decision.correlationId ?? input.executionId,
  });

  let workingMetadata: Readonly<Record<string, unknown>> = {
    ...meta,
    routingMode: nextRouting.routingMode,
    routingPolicyId: nextRouting.routingPolicyId,
    routingPolicyVersion: nextRouting.routingPolicyVersion,
    adaptiveDecisionId: nextRouting.adaptiveDecisionId,
    adaptiveSelected: nextRouting.adaptiveSelected,
    staticProviderId,
    staticModelId,
    correlationId: nextRouting.correlationId,
  };

  let req = input.req;

  if (decision.decision === "USE_ADAPTIVE" && decision.adaptive) {
    workingMetadata = {
      ...workingMetadata,
      preferredProviderId: decision.adaptive.providerId,
      preferredModelId: decision.adaptive.modelId,
      initialAdaptiveProviderId: decision.adaptive.providerId,
      initialAdaptiveModelId: decision.adaptive.modelId,
      ...(decision.adaptive.strategyId
        ? { strategyId: decision.adaptive.strategyId }
        : {}),
      ...(decision.adaptive.strategyVersion
        ? { strategyVersion: decision.adaptive.strategyVersion }
        : {}),
      ...(decision.adaptive.knowledgeId
        ? { knowledgeId: decision.adaptive.knowledgeId }
        : {}),
      ...(decision.adaptive.knowledgeVersion
        ? { knowledgeVersion: decision.adaptive.knowledgeVersion }
        : {}),
    };
    req = {
      ...req,
      providerId: decision.adaptive.providerId,
      modelId: decision.adaptive.modelId,
    };
    logAdaptiveRoutingExecution({
      executionId: input.executionId,
      correlationId: decision.correlationId ?? input.executionId,
      adaptiveSelected: true,
    });
  }

  return Object.freeze({
    workingMetadata,
    req,
    routingMetadata: nextRouting,
    staticProviderId,
    staticModelId,
  });
}
