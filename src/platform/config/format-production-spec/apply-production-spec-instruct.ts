/**
 * Phase 1 — Instruct path for Format & Production Spec.
 *
 * Same productionRuleId used for prompt injection and release enforcement.
 * Appends [UNAGENCY Production Spec] to provider-facing prompts and stamps
 * productionSpecBinding on execution metadata.
 */

import {
  PRODUCTION_PROMPT_BLOCK_HEADER,
  buildProductionPromptBlock,
  type ProductionPromptBlock,
} from "./production-prompt-block";
import {
  buildProductionSpecBindingFromResolved,
  readProductionSpecBinding,
  withProductionSpecBinding,
  type ProductionSpecBinding,
} from "./production-binding";
import {
  aspectRatioFromCanvas,
  resolveProductionRule,
} from "./resolve-production-rule";
import {
  productionSpecShouldInject,
  resolveProductionSpecRollout,
} from "./production-spec-rollout";
import { logProductionSpecTelemetry } from "./production-spec-telemetry";
import type {
  ResolveProductionRuleInput,
  ResolvedProductionRule,
} from "./types";

export type ProductionInstructBundle = {
  readonly resolved: ResolvedProductionRule;
  readonly promptBlock: ProductionPromptBlock;
  readonly binding: ProductionSpecBinding;
};

export function promptContainsProductionSpecBlock(prompt: string): boolean {
  return prompt.includes(PRODUCTION_PROMPT_BLOCK_HEADER);
}

/**
 * Append Spec prompt block once (idempotent on header presence).
 */
export function appendProductionPromptBlockToText(
  base: string,
  blockText: string,
): string {
  const b = base.trim();
  const block = blockText.trim();
  if (!block) return b;
  if (promptContainsProductionSpecBlock(b)) return b;
  return b ? `${b}\n\n${block}` : block;
}

export function resolveProductionInstructBundle(
  input: ResolveProductionRuleInput & {
    readonly boundAt?: string;
    readonly placementLabel?: string;
    readonly maxWeightedLines?: number;
  },
): ProductionInstructBundle | undefined {
  const resolved = resolveProductionRule(input);
  if (!resolved) return undefined;

  const promptBlock = buildProductionPromptBlock({
    rule: resolved.rule,
    placementLabel: input.placementLabel,
    maxWeightedLines: input.maxWeightedLines,
  });
  const binding = buildProductionSpecBindingFromResolved(resolved, {
    promptBlockHash: promptBlock.contentHash,
    boundAt: input.boundAt,
  });

  return Object.freeze({ resolved, promptBlock, binding });
}

export function resolveProductionInstructInputFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): ResolveProductionRuleInput {
  const read = (key: string): string | undefined => {
    const v = metadata?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  return {
    service: read("service"),
    subtype: read("subtype"),
    platform: read("platform"),
    formatId: read("format") ?? read("formatId"),
    placementId: read("placementId") ?? read("productionPlacementId"),
  };
}

/**
 * Stamp binding + denormalized prompt block fields onto metadata.
 * Also seeds aspectRatio from Spec canvas when missing (provider wire param).
 */
export function applyProductionSpecInstructToMetadata(
  metadata: Readonly<Record<string, unknown>>,
  options?: {
    readonly boundAt?: string;
    readonly maxWeightedLines?: number;
    /** When set, use this bundle instead of resolving from metadata. */
    readonly bundle?: ProductionInstructBundle;
    /** Skip inject when rollout is off (still resolves for callers that need binding). */
    readonly force?: boolean;
  },
): {
  readonly metadata: Record<string, unknown>;
  readonly bundle?: ProductionInstructBundle;
  readonly skippedByRollout?: boolean;
} {
  const resolveInput = resolveProductionInstructInputFromMetadata(metadata);
  const rollout = resolveProductionSpecRollout();
  const shouldInject =
    options?.force === true ||
    productionSpecShouldInject({ service: resolveInput.service, rollout });

  if (!shouldInject) {
    logProductionSpecTelemetry({
      event: "production_spec.rollout_skip",
      productionRuleId:
        typeof metadata.productionRuleId === "string"
          ? metadata.productionRuleId
          : undefined,
      service: resolveInput.service,
      platform: resolveInput.platform,
      rollout,
      injected: false,
      status: "INJECT_OFF",
    });
    return {
      metadata: { ...metadata },
      skippedByRollout: true,
    };
  }

  const existing = readProductionSpecBinding(metadata);
  const bundle =
    options?.bundle ??
    resolveProductionInstructBundle({
      ...resolveInput,
      boundAt: options?.boundAt ?? new Date().toISOString(),
      maxWeightedLines: options?.maxWeightedLines,
    });

  if (!bundle) {
    return { metadata: { ...metadata } };
  }

  // Keep existing binding if same rule + hash already stamped.
  if (
    existing?.productionRuleId === bundle.binding.productionRuleId &&
    existing.promptBlockHash === bundle.promptBlock.contentHash &&
    typeof metadata.productionPromptBlockText === "string" &&
    promptContainsProductionSpecBlock(String(metadata.productionPromptBlockText))
  ) {
    return { metadata: { ...metadata }, bundle };
  }

  let next: Record<string, unknown> = withProductionSpecBinding(
    metadata,
    bundle.binding,
  );
  next = {
    ...next,
    productionPromptBlockText: bundle.promptBlock.text,
    productionPromptBlockHash: bundle.promptBlock.contentHash,
    productionAuthorityStatus: bundle.binding.authorityStatus,
    productionSpecRollout: rollout,
  };

  const canvas = bundle.resolved.rule.canvas;
  if (canvas) {
    next = {
      ...next,
      productionCanvasWidth: canvas.width,
      productionCanvasHeight: canvas.height,
      productionCanvasUnit: canvas.unit,
    };
    if (canvas.unit === "px") {
      const aspect = aspectRatioFromCanvas(canvas.width, canvas.height);
      if (
        typeof next.aspectRatio !== "string" ||
        !String(next.aspectRatio).trim()
      ) {
        next = { ...next, aspectRatio: aspect };
      }
      // Provider wire helpers often read width/height directly.
      if (typeof next.width !== "number" && typeof next.width !== "string") {
        next = { ...next, width: canvas.width };
      }
      if (typeof next.height !== "number" && typeof next.height !== "string") {
        next = { ...next, height: canvas.height };
      }
    }
  }

  const exportFormats = bundle.resolved.rule.export?.formats;
  if (exportFormats?.length && !Array.isArray(next.productionExportFormats)) {
    next = {
      ...next,
      productionExportFormats: Object.freeze([...exportFormats]),
    };
  }

  // Keep conversationalEffectiveInstruction aligned with Spec instruct.
  const effective =
    typeof next.conversationalEffectiveInstruction === "string"
      ? next.conversationalEffectiveInstruction
      : "";
  if (effective.trim()) {
    next = {
      ...next,
      conversationalEffectiveInstruction: appendProductionPromptBlockToText(
        effective,
        bundle.promptBlock.text,
      ),
    };
  }

  logProductionSpecTelemetry({
    event: "production_spec.instruct",
    productionRuleId: bundle.binding.productionRuleId,
    promptBlockHash: bundle.promptBlock.contentHash,
    authorityStatus: bundle.binding.authorityStatus,
    service: resolveInput.service,
    platform: resolveInput.platform,
    rollout,
    injected: true,
    status: "INJECTED",
  });

  return {
    metadata: Object.freeze(next) as Record<string, unknown>,
    bundle,
  };
}

/**
 * Ensure a provider-facing prompt includes the Spec block for this metadata.
 */
export function ensureProviderPromptHasProductionSpec(input: {
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly boundAt?: string;
}): {
  readonly prompt: string;
  readonly metadata: Record<string, unknown>;
  readonly injected: boolean;
  readonly productionRuleId?: string;
} {
  const applied = applyProductionSpecInstructToMetadata(input.metadata ?? {}, {
    boundAt: input.boundAt,
  });
  const blockText =
    typeof applied.metadata.productionPromptBlockText === "string"
      ? applied.metadata.productionPromptBlockText
      : applied.bundle?.promptBlock.text ?? "";

  if (!blockText.trim()) {
    return {
      prompt: input.prompt.trim(),
      metadata: applied.metadata,
      injected: false,
    };
  }

  const before = input.prompt.trim();
  const after = appendProductionPromptBlockToText(before, blockText);
  return {
    prompt: after,
    metadata: applied.metadata,
    injected: after !== before,
    productionRuleId: applied.bundle?.binding.productionRuleId,
  };
}
