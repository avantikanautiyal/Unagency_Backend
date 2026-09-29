/**
 * Cap → use-case preference → hard capability filter → soft rank → executable leaf.
 * Composition-derived requirements are optional; use-case matrix remains soft ranking.
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
import type { ExecutionCapabilityRequirements } from "../../../cdf/generation-context/execution-capability-requirements";
import {
  filterProvidersByHardCapabilities,
  softRankProviderPreferences,
} from "../../../cdf/generation-context/execution-capability-requirements";
import { providerHasImageCapability } from "../configs/image-provider-capabilities";

export interface ImageRouteDecision {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly useCase: ImageCreativeUseCase;
  readonly label: string;
  readonly failoverChain: readonly { providerId: string; modelId: string }[];
  readonly capabilityRequirements?: ExecutionCapabilityRequirements;
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
    /** Composition-derived hard/soft requirements (optional). */
    capabilityRequirements?: ExecutionCapabilityRequirements | null;
  }): Result<ImageRouteDecision> {
    const rawCapability = input.capabilityId?.trim() || "image.generate";
    const capabilityId =
      rawCapability === "image.edit" ? "image.edit" : rawCapability;
    const matchCapability =
      capabilityId === "image.edit" ? "image.generate" : capabilityId;
    const executable = this.listExecutableImageProviderIds();
    if (executable.length === 0) {
      return failure(
        new ValidationError(
          "No LIVE-executable image provider available — add OpenAI / Gemini (Imagen) / Recraft / Ideogram credentials",
        ),
      );
    }

    const reqs = input.capabilityRequirements ?? null;
    const hardFiltered = reqs
      ? filterProvidersByHardCapabilities({
          providerIds: executable.map(String),
          hardCapabilities: reqs.hardCapabilities,
          providerHasCapability: providerHasImageCapability,
        })
      : executable.map(String);

    const allowed = new Set(hardFiltered);
    if (allowed.size === 0) {
      return failure(
        new ValidationError(
          "No image provider satisfies composition-derived hard capabilities",
        ),
      );
    }

    const useCase = resolveImageCreativeUseCase(input.prompt, {
      service: input.service,
      platform: input.platform,
      subtype:
        capabilityId === "image.edit"
          ? input.subtype?.trim() || "retouching"
          : input.subtype,
    });
    void matchCapability;

    let preferences = this.preferenceChain(useCase, allowed);
    if (reqs) {
      preferences = [
        ...softRankProviderPreferences({
          preferences,
          soft: reqs.softPreferences,
          providerHasCapability: providerHasImageCapability,
        }),
      ];
    }

    const executableSlots = listDistinctExecutableImageProviders(
      useCase,
      allowed,
      3,
    );

    let selected: ImageProviderPreference | undefined;

    const slotIndex =
      typeof input.routeVisualSlot === "number" && input.routeVisualSlot >= 0
        ? input.routeVisualSlot
        : undefined;

    const pref = input.preferredProviderId?.trim() || "";
    const preferredModel = input.preferredModelId?.trim() || "";

    // Exact preferred provider+model (fanout leaf authority) wins over route slots.
    // Provider-only pins must not matrix-fill — that collapses dual-OpenAI leaves.
    // Legacy route_visual may pin provider without model and rely on routeVisualSlot.
    if (pref && allowed.has(pref) && preferredModel) {
      const matrixMatch = preferences.find(
        (p) => p.providerId === pref && p.modelId === preferredModel,
      );
      selected = {
        providerId: pref,
        modelId: preferredModel,
        label: matrixMatch?.label ?? `${pref}/${preferredModel}`,
      };
    } else if (
      pref &&
      allowed.has(pref) &&
      !preferredModel &&
      slotIndex != null &&
      executableSlots[slotIndex]
    ) {
      selected = executableSlots[slotIndex]!;
    } else if (pref && allowed.has(pref) && !preferredModel) {
      return failure(
        new ValidationError(
          "preferredModelId is required when preferredProviderId is set — provider-only routing collapses dual-family fanout leaves",
          {
            reason: "FANOUT_LEAF_MODEL_REQUIRED",
            preferredProviderId: pref,
          },
        ),
      );
    } else if (slotIndex != null && executableSlots[slotIndex]) {
      selected = executableSlots[slotIndex]!;
    } else if (pref) {
      if (
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
          preferences[0] ??
          pickPreferredImageProvider(useCase, allowed);
      }
    } else if (
      typeof input.routeVisualSlot === "number" &&
      input.routeVisualSlot >= 0 &&
      executableSlots[input.routeVisualSlot]
    ) {
      selected = executableSlots[input.routeVisualSlot];
    } else {
      selected = preferences[0] ?? pickPreferredImageProvider(useCase, allowed);
    }

    if (!selected) {
      return failure(
        new ValidationError(
          "No image.generate preference matched executable providers",
        ),
      );
    }

    const failoverChain: { providerId: string; modelId: string }[] = [];
    const seen = new Set<string>([`${selected.providerId}::${selected.modelId}`]);
    for (const step of preferences) {
      const key = `${step.providerId}::${step.modelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      failoverChain.push({
        providerId: step.providerId,
        modelId: step.modelId,
      });
    }

    return success({
      providerId: selected.providerId,
      modelId: selected.modelId,
      capabilityId,
      useCase,
      label: selected.label,
      failoverChain,
      ...(reqs ? { capabilityRequirements: reqs } : {}),
    });
  }

  private preferenceChain(
    useCase: ImageCreativeUseCase,
    allowed: ReadonlySet<string>,
  ): ImageProviderPreference[] {
    return IMAGE_USE_CASE_PREFERENCES[useCase].filter((p) =>
      allowed.has(p.providerId),
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
