/**
 * Cap → use-case preference → executable image.generate leaf.
 * Sync image vendors (BFL / OpenAI / Imagen / Ideogram / Recraft).
 */

import { failure, success, type Result } from "../../../shared/result";
import { ValidationError } from "../../../shared/errors";
import type { ProviderId } from "../../../shared/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import {
  IMAGE_USE_CASE_PREFERENCES,
  pickPreferredImageProvider,
  resolveImageCreativeUseCase,
  type ImageCreativeUseCase,
  type ImageProviderPreference,
} from "./image-use-case-routing";

export interface ImageRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly useCase: ImageCreativeUseCase;
  readonly label: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
}

export class ImageExecutionRouter {
  constructor(private readonly registry: IProviderRuntimeRegistry) {}

  resolve(input: {
    prompt: string;
    capabilityId?: string;
    preferredProviderId?: string;
    preferredModelId?: string;
  }): Result<ImageRouteDecision> {
    const capabilityId = input.capabilityId?.trim() || "image.generate";
    const executable = this.listExecutableImageProviderIds();
    if (executable.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable image provider available — add BFL / OpenAI / Gemini (Imagen) / Recraft / Ideogram credentials"
        )
      );
    }

    const allowed = new Set(executable.map(String));
    const useCase = resolveImageCreativeUseCase(input.prompt);
    const preferences = this.preferenceChain(useCase, allowed);

    let selected: ImageProviderPreference | undefined;

    if (input.preferredProviderId?.trim()) {
      const pref = input.preferredProviderId.trim();
      if (!allowed.has(pref)) {
        return failure(
          new ValidationError(
            `Preferred provider ${pref} is not LIVE-executable for image.generate`
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
      selected = pickPreferredImageProvider(useCase, allowed) ?? preferences[0];
    }

    if (!selected) {
      return failure(
        new ValidationError("No image.generate preference matched executable providers")
      );
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

  private preferenceChain(
    useCase: ImageCreativeUseCase,
    allowed: ReadonlySet<string>
  ): ImageProviderPreference[] {
    return IMAGE_USE_CASE_PREFERENCES[useCase].filter((p) =>
      allowed.has(p.providerId)
    );
  }

  private listExecutableImageProviderIds(): readonly ProviderId[] {
    return this.registry.listAvailableProviderIds().filter((id) => {
      const entry = this.registry.resolveAvailable(id);
      if (!entry) return false;
      return entry.capabilities.includes("image.generate");
    });
  }
}

export function createImageExecutionRouter(options: {
  registry: IProviderRuntimeRegistry;
}): ImageExecutionRouter {
  return new ImageExecutionRouter(options.registry);
}
