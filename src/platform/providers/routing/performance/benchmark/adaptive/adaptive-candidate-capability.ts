/**
 * Step 13 — Real adaptive candidate capability verification.
 * Reuses provider runtime registry + model registry + compatibility engine.
 */

import { asProviderId } from "../../../../../core/identifiers";
import type { ICompatibilityEngine, IModelRegistry } from "../../../../../model-registry/interfaces/model-registry";
import type { IProviderRuntimeRegistry } from "../../../../runtime/registry/in-memory-provider-runtime-registry";

export type AdaptiveCapabilityContext = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilityId: string;
  readonly service?: string;
  readonly subtype?: string;
  readonly outputKind?: string;
  readonly requiresStructuredOutput?: boolean;
};

export type AdaptiveCapabilityVerdict = {
  readonly executable: boolean;
  readonly reasons: readonly string[];
};

export function verifyAdaptiveCandidateCapability(input: {
  readonly context: AdaptiveCapabilityContext;
  readonly providerRegistry: IProviderRuntimeRegistry;
  readonly modelRegistry: IModelRegistry;
  readonly compatibilityEngine: ICompatibilityEngine;
}): AdaptiveCapabilityVerdict {
  const reasons: string[] = [];
  const { context } = input;

  const providerEntry = input.providerRegistry.resolveAvailable(
    asProviderId(context.providerId),
  );
  if (!providerEntry) {
    reasons.push(`Provider unavailable or not executable: ${context.providerId}`);
    return Object.freeze({ executable: false, reasons: Object.freeze(reasons) });
  }

  if (
    context.capabilityId &&
    providerEntry.capabilities.length > 0 &&
    !providerEntry.capabilities.includes(context.capabilityId)
  ) {
    reasons.push(
      `Provider ${context.providerId} does not declare capability ${context.capabilityId}`,
    );
  }

  const modelResult = input.modelRegistry.getModel(context.modelId);
  if (!modelResult.ok) {
    reasons.push(`Model not found in registry: ${context.modelId}`);
    return Object.freeze({ executable: false, reasons: Object.freeze(reasons) });
  }

  const model = modelResult.value;
  if (model.lifecycle.state === "disabled" || model.lifecycle.state === "retired") {
    reasons.push(`Model ${context.modelId} lifecycle state is ${model.lifecycle.state}`);
  }
  if (model.availability === "unavailable") {
    reasons.push(`Model ${context.modelId} availability is unavailable`);
  }

  const compat = input.compatibilityEngine.isCompatible(model, context.capabilityId);
  if (compat.ok && compat.value === false) {
    reasons.push(
      `Model ${context.modelId} incompatible with capability ${context.capabilityId}`,
    );
  }

  if (context.requiresStructuredOutput && !model.flags.structuredOutput) {
    reasons.push(`Model ${context.modelId} lacks structured-output support`);
  }

  return Object.freeze({
    executable: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export function createAdaptiveCandidateExecutableChecker(input: {
  readonly providerRegistry: IProviderRuntimeRegistry;
  readonly modelRegistry: IModelRegistry;
  readonly compatibilityEngine: ICompatibilityEngine;
  readonly requiresStructuredOutput?: (capabilityId: string, outputKind?: string) => boolean;
}): (ctx: AdaptiveCapabilityContext) => boolean {
  return (ctx) =>
    verifyAdaptiveCandidateCapability({
      context: ctx,
      providerRegistry: input.providerRegistry,
      modelRegistry: input.modelRegistry,
      compatibilityEngine: input.compatibilityEngine,
    }).executable;
}
