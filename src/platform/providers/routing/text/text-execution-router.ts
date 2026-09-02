/**
 * Cap → matrix use-case → preferred text provider (soft preference for Integration OS).
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import {
  TEXT_USE_CASE_PREFERENCES,
  RESEARCH_WEB_SEARCH_PREFERENCES,
  pickFirstExecutablePref,
  resolveTextCreativeUseCaseFromMetadata,
  type MatrixProviderPref,
  type TextCreativeUseCase,
} from "../../routing/matrix/matrix-use-case-routing";

export interface TextRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly useCase: TextCreativeUseCase;
  readonly label: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}

const TEXT_CAPS = new Set([
  "text.generate",
  "text.chat",
  "reasoning.analyze",
  "research.web_search",
]);

export class TextExecutionRouter {
  constructor(private readonly registry: IProviderRuntimeRegistry) {}

  resolve(input: {
    prompt: string;
    capabilityId?: string;
    preferredProviderId?: string;
    preferredModelId?: string;
    metadata?: Readonly<Record<string, unknown>>;
  }): Result<TextRouteDecision> {
    const capabilityId = input.capabilityId?.trim() || "text.generate";
    const executable = this.listExecutableTextProviderIds();
    if (executable.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable text provider — set OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY / etc."
        )
      );
    }

    const allowed = new Set(executable.map(String));
    const isResearch = capabilityId === "research.web_search";
    const useCase = isResearch
      ? ("research" as TextCreativeUseCase)
      : resolveTextCreativeUseCaseFromMetadata(input.prompt, input.metadata);
    const preferenceSource = isResearch
      ? RESEARCH_WEB_SEARCH_PREFERENCES
      : TEXT_USE_CASE_PREFERENCES[useCase];
    const preferences = preferenceSource.filter((p) =>
      allowed.has(p.providerId)
    );

    let selected: MatrixProviderPref | undefined;
    if (input.preferredProviderId?.trim()) {
      const pref = input.preferredProviderId.trim();
      if (!allowed.has(pref)) {
        return failure(
          new ValidationError(
            `Preferred provider ${pref} is not LIVE-executable for ${capabilityId}`
          )
        );
      }
      selected = {
        providerId: pref,
        modelId:
          input.preferredModelId?.trim() ||
          preferences.find((p) => p.providerId === pref)?.modelId ||
          "default",
        label: pref,
      };
    } else {
      selected = pickFirstExecutablePref(preferenceSource, allowed);
    }

    if (!selected) {
      // Fall back to any executable text leaf.
      const anyId = String(executable[0]);
      selected = {
        providerId: anyId,
        modelId: "default",
        label: anyId,
      };
    }

    const failoverChain: { providerId: string; modelId: string }[] = [];
    const seen = new Set<string>([`${selected.providerId}::${selected.modelId}`]);
    for (const step of preferences) {
      const key = `${step.providerId}::${step.modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failoverChain.push({ providerId: step.providerId, modelId: step.modelId });
    }

    return success({
      providerId: selected.providerId,
      modelId: selected.modelId,
      capabilityId,
      useCase,
      label: selected.label,
      failoverChain,
    });
  }

  private listExecutableTextProviderIds(): readonly ProviderId[] {
    return this.registry.listAvailableProviderIds().filter((id) => {
      const entry = this.registry.resolveAvailable(id);
      if (!entry) return false;
      return entry.capabilities.some((c) => TEXT_CAPS.has(c));
    });
  }
}

export function createTextExecutionRouter(options: {
  registry: IProviderRuntimeRegistry;
}): TextExecutionRouter {
  return new TextExecutionRouter(options.registry);
}
