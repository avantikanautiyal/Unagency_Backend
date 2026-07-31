/**
 * Cap → Model Intelligence → Routing for video.generate.
 * Only executable registry providers are candidates (blocked/unverified excluded).
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import { asCapabilityId, type ProviderId } from "../../../shared/identifiers";
import { ModelIntelligenceRequestBuilder } from "../../../model-intelligence";
import { createModelIntelligencePlatform } from "../../../model-intelligence/factories/create-model-intelligence-platform";
import type { IModelIntelligenceEngine } from "../../../model-intelligence/interfaces/model-intelligence";
import type { IProviderRoutingEngine } from "../../routing/interfaces/routing";
import { createRoutingPlatform } from "../../routing/factories/create-routing-platform";
import { toRoutingRequest } from "../../../integration/adapters/request-adapters";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import { isAsyncProviderDispatcher } from "../../async/interfaces/async-provider-dispatcher";

export interface VideoRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly routingDecisionId: string;
  readonly capabilityId: string;
  /** Ordered failover candidates excluding primary (provider+model). */
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}

export interface VideoExecutionRouterOptions {
  readonly modelIntelligence: IModelIntelligenceEngine;
  readonly routing: IProviderRoutingEngine;
  readonly registry: IProviderRuntimeRegistry;
  readonly createId: (prefix: string) => string;
}

export class VideoExecutionRouter {
  constructor(private readonly deps: VideoExecutionRouterOptions) {}

  /**
   * Resolve primary video provider/model from Model Intelligence + Routing.
   * Optional preference is honored only when it is among executable candidates.
   */
  async resolve(input: {
    prompt: string;
    capabilityId?: string;
    preferredProviderId?: string;
    preferredModelId?: string;
  }): Promise<Result<VideoRouteDecision>> {
    const capabilityId = input.capabilityId?.trim() || "video.generate";
    const executableIds = this.listExecutableVideoProviderIds();
    if (executableIds.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable video provider available — verify adapter + credentials"
        )
      );
    }

    const miReq = ModelIntelligenceRequestBuilder.create()
      .withRequestId(this.deps.createId("mi_video"))
      .withCapabilityId(asCapabilityId(capabilityId))
      .withDepartment("marketing")
      .withTaskDescription(input.prompt.slice(0, 500))
      .withExpectedOutputTokens(0)
      .build();

    const recommended = await this.deps.modelIntelligence.recommend(miReq);
    if (!recommended.ok) return recommended;

    const allowed = new Set(executableIds.map(String));
    const filteredCandidates = {
      ...recommended.value,
      candidates: {
        ...recommended.value.candidates,
        candidates: recommended.value.candidates.candidates.filter((c) =>
          allowed.has(String(c.providerId))
        ),
      },
    };

    if (filteredCandidates.candidates.candidates.length === 0) {
      return failure(
        new ValidationError(
          "Model Intelligence returned no executable video.generate candidates"
        )
      );
    }

    const routingReq = toRoutingRequest(this.deps.createId("route_video"), filteredCandidates);
    const decision = await this.deps.routing.route(routingReq);
    if (!decision.ok) return decision;

    let providerId = String(decision.value.plan.primary.providerId);
    let modelId = String(decision.value.plan.primary.modelId);

    if (input.preferredProviderId?.trim()) {
      const pref = input.preferredProviderId.trim();
      if (!allowed.has(pref)) {
        return failure(
          new ValidationError(
            `Preferred provider ${pref} is not LIVE-executable for video.generate`
          )
        );
      }
      const match = filteredCandidates.candidates.candidates.find(
        (c) =>
          String(c.providerId) === pref &&
          (!input.preferredModelId || String(c.modelId) === input.preferredModelId)
      );
      if (match) {
        providerId = String(match.providerId);
        modelId = String(match.modelId);
      } else if (input.preferredModelId?.trim()) {
        // Prefer explicit model on preferred executable provider when MI listed the provider
        const anyOnProvider = filteredCandidates.candidates.candidates.find(
          (c) => String(c.providerId) === pref
        );
        if (anyOnProvider) {
          providerId = pref;
          modelId = input.preferredModelId.trim();
        }
      }
    }

    const failoverChain: { providerId: string; modelId: string }[] = [];
    const seen = new Set<string>([`${providerId}::${modelId}`]);
    for (const step of decision.value.plan.failoverChain) {
      const pid = String(step.providerId);
      const mid = step.modelId ? String(step.modelId) : modelId;
      const key = `${pid}::${mid}`;
      if (seen.has(key)) continue;
      if (!allowed.has(pid)) continue;
      seen.add(key);
      failoverChain.push({ providerId: pid, modelId: mid });
    }

    return success({
      providerId,
      modelId,
      routingDecisionId: String(decision.value.decisionId),
      capabilityId,
      failoverChain,
    });
  }

  private listExecutableVideoProviderIds(): readonly ProviderId[] {
    return this.deps.registry.listAvailableProviderIds().filter((id) => {
      const entry = this.deps.registry.resolveAvailable(id);
      if (!entry) return false;
      if (!entry.capabilities.includes("video.generate")) return false;
      return entry.dispatcher && isAsyncProviderDispatcher(entry.dispatcher);
    });
  }
}

export function createVideoExecutionRouter(options: {
  registry: IProviderRuntimeRegistry;
  createId: (prefix: string) => string;
  nowIso?: () => string;
  clockMs?: () => number;
  allowedProviderIds?: readonly ProviderId[];
}): VideoExecutionRouter {
  const allowed =
    options.allowedProviderIds ??
    options.registry.listAvailableProviderIds().filter((id) => {
      const entry = options.registry.resolveAvailable(id);
      return Boolean(entry?.capabilities.includes("video.generate"));
    });

  const modelIntel = createModelIntelligencePlatform({
    createId: options.createId,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
    allowedProviderIds: allowed,
  });
  const routing = createRoutingPlatform({
    createId: options.createId,
    nowIso: options.nowIso,
    clockMs: options.clockMs,
  });

  return new VideoExecutionRouter({
    modelIntelligence: modelIntel.engine,
    routing: routing.engine,
    registry: options.registry,
    createId: options.createId,
  });
}
