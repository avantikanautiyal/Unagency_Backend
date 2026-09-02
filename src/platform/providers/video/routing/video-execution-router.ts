/**
 * Cap → matrix routing for video.generate (no model intelligence layer).
 * Honors client preferredProviderId pins; otherwise picks from use-case matrix.
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import { isAsyncProviderDispatcher } from "../../async/interfaces/async-provider-dispatcher";
import {
  PAUSED_VIDEO_PROVIDER_IDS,
  pickFirstExecutablePref,
  resolveVideoCreativeUseCase,
  VIDEO_USE_CASE_PREFERENCES,
} from "../../routing/matrix/matrix-use-case-routing";

export interface VideoRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly routingDecisionId: string;
  readonly capabilityId: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}

export interface VideoExecutionRouterOptions {
  readonly registry: IProviderRuntimeRegistry;
  readonly createId: (prefix: string) => string;
}

export class VideoExecutionRouter {
  constructor(private readonly deps: VideoExecutionRouterOptions) {}

  async resolve(input: {
    prompt: string;
    capabilityId?: string;
    preferredProviderId?: string;
    preferredModelId?: string;
    service?: string;
    platform?: string;
    subtype?: string;
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

    const allowed = new Set(executableIds.map(String));

    const useCase = resolveVideoCreativeUseCase(input.prompt, {
      service: input.service,
      platform: input.platform,
      subtype: input.subtype,
    });
    const matrixPrefs = VIDEO_USE_CASE_PREFERENCES[useCase];
    const matrixPick = pickFirstExecutablePref(matrixPrefs, allowed);

    let providerId = matrixPick?.providerId ?? String(executableIds[0]);
    let modelId =
      matrixPick?.modelId ??
      `${String(providerId).replace(/^provider\./, "")}/default`;

    const preferred = input.preferredProviderId?.trim();
    if (preferred) {
      if (allowed.has(preferred) && !PAUSED_VIDEO_PROVIDER_IDS.has(preferred)) {
        providerId = preferred;
        if (input.preferredModelId?.trim()) {
          modelId = input.preferredModelId.trim();
        }
      }
      // Ignore paused providers and image-engine pins not LIVE for video.
    } else if (matrixPick) {
      providerId = matrixPick.providerId;
      modelId = matrixPick.modelId.includes("/")
        ? matrixPick.modelId
        : `${matrixPick.providerId.replace(/^provider\./, "")}/${matrixPick.modelId}`;
    }

    if (!modelId.includes("/")) {
      modelId = `${providerId.replace(/^provider\./, "")}/${modelId}`;
    }

    const failoverChain: { providerId: string; modelId: string }[] = [];
    const seen = new Set<string>([`${providerId}::${modelId}`]);
    for (const step of matrixPrefs) {
      if (!allowed.has(step.providerId)) continue;
      const stepModel = step.modelId.includes("/")
        ? step.modelId
        : `${step.providerId.replace(/^provider\./, "")}/${step.modelId}`;
      const key = `${step.providerId}::${stepModel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failoverChain.push({ providerId: step.providerId, modelId: stepModel });
    }

    return success({
      providerId,
      modelId,
      routingDecisionId: this.deps.createId("route_video"),
      capabilityId,
      failoverChain,
    });
  }

  private listExecutableVideoProviderIds(): readonly ProviderId[] {
    return this.deps.registry.listAvailableProviderIds().filter((id) => {
      if (PAUSED_VIDEO_PROVIDER_IDS.has(String(id))) return false;
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
}): VideoExecutionRouter {
  return new VideoExecutionRouter({
    registry: options.registry,
    createId: options.createId,
  });
}
