/**
 * Cap → use-case preference → executable image.generate leaf.
 * Sync image vendors (OpenAI / Imagen / Ideogram / Recraft).
 */

import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { ProviderId } from "../../../core/identifiers";
import type { IProviderRuntimeRegistry } from "../../runtime/registry/in-memory-provider-runtime-registry";
import {
  IMAGE_USE_CASE_PREFERENCES,
  listDistinctExecutableImageProviders,
  matrixDistinctProviderIndex,
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
    service?: string;
    platform?: string;
    subtype?: string;
    /** Parallel route fan-out slot (0–2) from mobile route_visual metadata. */
    routeVisualSlot?: number;
  }): Result<ImageRouteDecision> {
    const rawCapability = input.capabilityId?.trim() || "image.generate";
    // image.edit uses the same LIVE image providers; keep the edit capability
    // on the decision so prompts/dispatch can treat retouching distinctly.
    const capabilityId =
      rawCapability === "image.edit" ? "image.edit" : rawCapability;
    const matchCapability =
      capabilityId === "image.edit" ? "image.generate" : capabilityId;
    const executable = this.listExecutableImageProviderIds();
    if (executable.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable image provider available — add OpenAI / Gemini (Imagen) / Recraft / Ideogram credentials"
        )
      );
    }

    const allowed = new Set(executable.map(String));
    const useCase = resolveImageCreativeUseCase(input.prompt, {
      service: input.service,
      platform: input.platform,
      subtype:
        capabilityId === "image.edit"
          ? input.subtype?.trim() || "retouching"
          : input.subtype,
    });
    void matchCapability;
    const preferences = this.preferenceChain(useCase, allowed);
    const executableSlots = listDistinctExecutableImageProviders(useCase, allowed, 3);

    let selected: ImageProviderPreference | undefined;

    const slotIndex =
      typeof input.routeVisualSlot === "number" && input.routeVisualSlot >= 0
        ? input.routeVisualSlot
        : undefined;

    // Parallel route fan-out: slot index always maps to a distinct LIVE provider.
    if (slotIndex != null && executableSlots[slotIndex]) {
      selected = executableSlots[slotIndex]!;
    } else if (input.preferredProviderId?.trim()) {
      const pref = input.preferredProviderId.trim();
      if (allowed.has(pref)) {
        const matrixMatch = preferences.find((p) => p.providerId === pref);
        selected = {
          providerId: pref,
          modelId:
            input.preferredModelId?.trim() ||
            matrixMatch?.modelId ||
            "default",
          label: matrixMatch?.label ?? pref,
        };
      } else if (
        typeof input.routeVisualSlot === "number" &&
        input.routeVisualSlot >= 0 &&
        executableSlots[input.routeVisualSlot]
      ) {
        selected = executableSlots[input.routeVisualSlot]!;
      } else {
        const matrixIdx = matrixDistinctProviderIndex(useCase, pref);
        const slotIdx =
          matrixIdx >= 0
            ? Math.min(matrixIdx, Math.max(executableSlots.length - 1, 0))
            : 0;
        selected =
          executableSlots[slotIdx] ??
          pickPreferredImageProvider(useCase, allowed) ??
          preferences[0];
      }
    } else if (
      typeof input.routeVisualSlot === "number" &&
      input.routeVisualSlot >= 0 &&
      executableSlots[input.routeVisualSlot]
    ) {
      selected = executableSlots[input.routeVisualSlot];
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
