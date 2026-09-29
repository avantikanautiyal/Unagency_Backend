/**
 * GenerationFanoutContract — authoritative multi-model fanout topology.
 *
 * Fanout ≠ failover:
 * - Fanout plans N intentional independent leaves from ONE shared creative spec.
 * - Failover may replace a provider INSIDE one leaf only.
 *
 * Cardinality authority is this contract + phase allowsModelGenerationFanout.
 * The following MUST NOT set fanout cardinality:
 * - ExecutionSpec.quantity / outputMode
 * - provider availability / inventory collapse
 * - route index / frontend array length / visualStatus
 * - successful-provider count / fallback chain
 *
 * Declared image families: OpenAI primary + Gemini + OpenAI secondary.
 * Unavailable targets remain in the plan as UNAVAILABLE — cardinality stays N.
 */

import {
  IMAGE_USE_CASE_PREFERENCES,
  type ImageCreativeUseCase,
  type ImageProviderPreference,
} from "../providers/image/routing/image-use-case-routing";
import {
  PAUSED_VIDEO_PROVIDER_IDS,
  VIDEO_USE_CASE_PREFERENCES,
  type MatrixProviderPref,
  type VideoCreativeUseCase,
} from "../providers/routing/matrix/matrix-use-case-routing";

/** Declared fanout slots: OpenAI primary + Gemini + OpenAI secondary (distinct model). */
export const GENERATION_FANOUT_PROVIDER_FAMILIES = [
  "provider.openai",
  "provider.google",
  "provider.openai",
] as const;

export const VIDEO_GENERATION_FANOUT_PROVIDER_FAMILIES = [
  "provider.kling",
  "provider.luma",
  "provider.minimax",
] as const;

export type GenerationFanoutProviderFamily =
  (typeof GENERATION_FANOUT_PROVIDER_FAMILIES)[number];

export type GenerationFanoutTargetAvailability =
  | "selected"
  | "available"
  | "unavailable"
  | "unsupported";

export type GenerationFanoutTarget = {
  readonly targetId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly label: string;
  readonly index: number;
  /** Inventory/runtime availability — never collapses declared cardinality. */
  readonly availability: GenerationFanoutTargetAvailability;
};

/**
 * Authoritative fanout contract for one generation group.
 * Single source of topology truth for planners + leaf metadata.
 */
export type GenerationFanoutContract = {
  readonly cardinality: number;
  readonly targets: readonly GenerationFanoutTarget[];
  readonly providerModelPreferences: readonly {
    readonly providerId: string;
    readonly modelId: string;
    readonly label: string;
  }[];
  readonly independencePolicy: "independent_leaves";
  readonly failoverPolicy: "intra_leaf_only";
  readonly disableCrossProviderFailover: true;
  readonly groupId: string;
  readonly useCase: ImageCreativeUseCase | VideoCreativeUseCase;
};

/** @deprecated Prefer GenerationFanoutContract — plan shape is the contract. */
export type GenerationFanoutPlan = GenerationFanoutContract & {
  readonly useCase: ImageCreativeUseCase;
};

export type FanoutFailoverCandidate = {
  readonly providerId: string;
  readonly modelId: string;
};

/**
 * Same-provider model fallbacks only (intra_leaf_only).
 * Never lists sibling fanout families — those are independent leaves, not failover.
 */
export const INTRA_PROVIDER_IMAGE_MODEL_FALLBACKS: Readonly<
  Record<string, readonly string[]>
> = {
  // Primary matrix model is gemini-3-pro-image; flash models are same-provider recovery.
  "provider.google": ["gemini-3.1-flash-image", "gemini-2.5-flash-image"],
  // Declared inventory OpenAI image models (distinct from whatever leaf primary is).
  "provider.openai": [
    "gpt-image-1.5",
    "gpt-image-2",
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
  ],
};

export const INTRA_PROVIDER_VIDEO_MODEL_FALLBACKS: Readonly<
  Record<string, readonly string[]>
> = {
  "provider.kling": [],
  "provider.luma": [],
  "provider.minimax": [],
};

/**
 * Build declarative intra-leaf failover candidates.
 * - Same providerId only (disableCrossProviderFailover).
 * - Never includes sibling fanout provider families as substitutes.
 * - Compatible matrix / declared alternate models only.
 */
export function resolveIntraLeafFailoverChain(input: {
  readonly primaryProviderId: string;
  readonly primaryModelId: string;
  readonly matrixChain?: readonly FanoutFailoverCandidate[];
  readonly declaredModelIds?: readonly string[];
  readonly maxCandidates?: number;
  /** provider::model keys of sibling fanout targets — never a leaf fallback. */
  readonly excludeModelKeys?: ReadonlySet<string>;
}): FanoutFailoverCandidate[] {
  const primaryProvider = input.primaryProviderId.trim();
  const primaryModel = input.primaryModelId.trim();
  if (!primaryProvider || !primaryModel) return [];

  const max = Math.max(1, input.maxCandidates ?? 2);
  const seen = new Set<string>([`${primaryProvider}::${primaryModel}`]);
  const out: FanoutFailoverCandidate[] = [];

  const push = (providerId: string, modelId: string) => {
    const p = providerId.trim();
    const m = modelId.trim();
    if (!p || !m) return;
    // Cross-provider is forbidden on fanout leaves.
    if (p !== primaryProvider) return;
    const key = `${p}::${m}`;
    if (seen.has(key)) return;
    // A sibling target's model is another leaf, not this leaf's fallback.
    if (input.excludeModelKeys?.has(key)) return;
    seen.add(key);
    out.push({ providerId: p, modelId: m });
  };

  for (const step of input.matrixChain ?? []) {
    push(step.providerId, step.modelId);
    if (out.length >= max) return out;
  }

  const declared =
    input.declaredModelIds ??
    INTRA_PROVIDER_IMAGE_MODEL_FALLBACKS[primaryProvider] ??
    INTRA_PROVIDER_VIDEO_MODEL_FALLBACKS[primaryProvider] ??
    [];
  for (const modelId of declared) {
    push(primaryProvider, modelId);
    if (out.length >= max) return out;
  }

  return out;
}

export type GenerationFanoutLeafMetadata = {
  readonly generationFanoutGroupId: string;
  readonly generationFanoutTargetId: string;
  readonly generationFanoutTargetIndex: number;
  readonly generationFanoutLeaf: true;
  readonly disableCrossProviderFailover: true;
  readonly preferredProviderId: string;
  readonly preferredModelId: string;
  readonly requestedProvider: string;
  readonly requestedModel: string;
  /** Intra-leaf same-provider candidates only — never sibling leaf providers. */
  readonly imageFailoverChain: readonly FanoutFailoverCandidate[];
  readonly generationFanoutSiblingModelKeys: readonly string[];
  readonly imageProviderLabel?: string;
  readonly generationFanoutTargetAvailability?: GenerationFanoutTargetAvailability;
};

function preferenceKey(pref: ImageProviderPreference): string {
  return `${pref.providerId}::${pref.modelId}`;
}

/**
 * Resolve configured matrix models for a provider family under a use-case
 * (all matching rows — supports multiple models per family when declared).
 */
export function resolveConfiguredImageModelsForProvider(input: {
  readonly useCase: ImageCreativeUseCase;
  readonly providerId: string;
}): ImageProviderPreference[] {
  const chains = [
    IMAGE_USE_CASE_PREFERENCES[input.useCase],
    IMAGE_USE_CASE_PREFERENCES.general,
  ];
  const seen = new Set<string>();
  const out: ImageProviderPreference[] = [];
  for (const chain of chains) {
    for (const pref of chain) {
      if (pref.providerId !== input.providerId) continue;
      const key = preferenceKey(pref);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(pref);
    }
  }
  return out;
}

/**
 * Resolve the first configured matrix model for a provider family under a use-case.
 */
export function resolveConfiguredImageModelForProvider(input: {
  readonly useCase: ImageCreativeUseCase;
  readonly providerId: string;
}): ImageProviderPreference | null {
  return resolveConfiguredImageModelsForProvider(input)[0] ?? null;
}

/**
 * Build the authoritative GenerationFanoutContract for image generation.
 *
 * Declared cardinality comes from providerFamilies / maxTargets — NOT from
 * executable inventory. Unavailable providers stay as targets with
 * availability=unavailable so UI/runtime can surface FAILED/UNAVAILABLE
 * without silently collapsing fanout to 1–2 leaves.
 *
 * ExecutionSpec.quantity / outputMode are intentionally not parameters.
 */
export function resolveGenerationFanoutContract(input: {
  readonly useCase: ImageCreativeUseCase;
  readonly groupId: string;
  readonly providerFamilies?: readonly string[];
  readonly maxTargets?: number;
  readonly executableProviderIds?: ReadonlySet<string>;
}): GenerationFanoutContract {
  const families =
    input.providerFamilies ??
    (GENERATION_FANOUT_PROVIDER_FAMILIES as readonly string[]);
  const max = Math.max(1, input.maxTargets ?? families.length);
  const targets: GenerationFanoutTarget[] = [];
  const prefs: GenerationFanoutContract["providerModelPreferences"][number][] =
    [];
  const seen = new Set<string>();

  // Walk declared slots in order — each slot picks the next unused model for
  // that provider (supports two OpenAI leaves with distinct inventory models).
  for (const providerId of families) {
    if (targets.length >= max) break;
    const models = resolveConfiguredImageModelsForProvider({
      useCase: input.useCase,
      providerId,
    });
    const pref = models.find((m) => !seen.has(preferenceKey(m)));
    if (!pref) {
      targets.push({
        targetId: `fanout_${targets.length}_${providerId.replace(/^provider\./, "")}`,
        providerId,
        modelId: "unconfigured",
        label: providerId.replace(/^provider\./, ""),
        index: targets.length,
        availability: "unsupported",
      });
      continue;
    }
    const key = preferenceKey(pref);
    seen.add(key);
    const executable =
      !input.executableProviderIds ||
      input.executableProviderIds.has(pref.providerId);
    prefs.push({
      providerId: pref.providerId,
      modelId: pref.modelId,
      label: pref.label,
    });
    targets.push({
      targetId: `fanout_${targets.length}_${pref.providerId.replace(/^provider\./, "")}`,
      providerId: pref.providerId,
      modelId: pref.modelId,
      label: pref.label,
      index: targets.length,
      availability: executable ? "selected" : "unavailable",
    });
  }

  // If matrix lists additional distinct models under allowed families and we
  // still have slots (legacy dual-model same-family), fill remaining slots
  // without exceeding declared max — only when families intentionally repeat.
  if (targets.length < max) {
    const allowed = new Set(families);
    const chains = [
      IMAGE_USE_CASE_PREFERENCES[input.useCase],
      IMAGE_USE_CASE_PREFERENCES.general,
    ];
    for (const chain of chains) {
      for (const pref of chain) {
        if (targets.length >= max) break;
        if (!allowed.has(pref.providerId)) continue;
        const key = preferenceKey(pref);
        if (seen.has(key)) continue;
        seen.add(key);
        const executable =
          !input.executableProviderIds ||
          input.executableProviderIds.has(pref.providerId);
        prefs.push({
          providerId: pref.providerId,
          modelId: pref.modelId,
          label: pref.label,
        });
        targets.push({
          targetId: `fanout_${targets.length}_${pref.providerId.replace(/^provider\./, "")}`,
          providerId: pref.providerId,
          modelId: pref.modelId,
          label: pref.label,
          index: targets.length,
          availability: executable ? "selected" : "unavailable",
        });
      }
      if (targets.length >= max) break;
    }
  }

  return {
    cardinality: targets.length,
    targets,
    providerModelPreferences: prefs,
    independencePolicy: "independent_leaves",
    failoverPolicy: "intra_leaf_only",
    disableCrossProviderFailover: true,
    groupId: input.groupId,
    useCase: input.useCase,
  };
}

/**
 * Plan intentional image-generation fanout targets from the inventory matrix.
 * Cardinality is contract-declared; unavailable providers are retained.
 */
export function planImageGenerationFanout(input: {
  readonly useCase: ImageCreativeUseCase;
  readonly executableProviderIds?: ReadonlySet<string>;
  readonly groupId: string;
  readonly providerFamilies?: readonly string[];
  readonly maxTargets?: number;
}): GenerationFanoutPlan {
  const contract = resolveGenerationFanoutContract(input);
  return {
    ...contract,
    useCase: input.useCase,
  };
}

/** Executable (selected/available) targets only — for create() calls. */
export function executableFanoutTargets(
  plan: Pick<GenerationFanoutContract, "targets">,
): readonly GenerationFanoutTarget[] {
  return plan.targets.filter(
    (t) => t.availability === "selected" || t.availability === "available",
  );
}

function resolveConfiguredVideoModelForProvider(input: {
  readonly useCase: VideoCreativeUseCase;
  readonly providerId: string;
}): MatrixProviderPref | null {
  const chains = [
    VIDEO_USE_CASE_PREFERENCES[input.useCase],
    VIDEO_USE_CASE_PREFERENCES.general,
  ];
  for (const chain of chains) {
    for (const pref of chain) {
      // Include paused providers for fanout slot identity; availability gates execution.
      if (pref.providerId === input.providerId) return pref;
    }
  }
  return null;
}

/**
 * Plan intentional video-generation fanout from VIDEO_USE_CASE_PREFERENCES.
 * Independent leaves — no cross-provider failover. Unavailable retained.
 */
export function planVideoGenerationFanout(input: {
  readonly useCase: VideoCreativeUseCase;
  readonly executableProviderIds?: ReadonlySet<string>;
  readonly groupId: string;
  readonly providerFamilies?: readonly string[];
  readonly maxTargets?: number;
}): GenerationFanoutContract & { readonly useCase: VideoCreativeUseCase } {
  const families =
    input.providerFamilies ??
    (VIDEO_GENERATION_FANOUT_PROVIDER_FAMILIES as readonly string[]);
  const max = Math.max(1, input.maxTargets ?? families.length);
  const targets: GenerationFanoutTarget[] = [];
  const prefs: GenerationFanoutContract["providerModelPreferences"][number][] =
    [];

  for (const providerId of families) {
    if (targets.length >= max) break;
    const pref = resolveConfiguredVideoModelForProvider({
      useCase: input.useCase,
      providerId,
    });
    if (!pref) {
      targets.push({
        targetId: `fanout_${targets.length}_${providerId.replace(/^provider\./, "")}`,
        providerId,
        modelId: "unconfigured",
        label: providerId.replace(/^provider\./, ""),
        index: targets.length,
        availability: "unsupported",
      });
      continue;
    }
    const paused = PAUSED_VIDEO_PROVIDER_IDS.has(providerId);
    const executable =
      !paused &&
      (!input.executableProviderIds ||
        input.executableProviderIds.has(providerId));
    prefs.push({
      providerId: pref.providerId,
      modelId: pref.modelId,
      label: pref.label,
    });
    targets.push({
      targetId: `fanout_${targets.length}_${providerId.replace(/^provider\./, "")}`,
      providerId: pref.providerId,
      modelId: pref.modelId,
      label: pref.label,
      index: targets.length,
      availability: executable ? "selected" : "unavailable",
    });
  }

  return {
    cardinality: targets.length,
    targets,
    providerModelPreferences: prefs,
    independencePolicy: "independent_leaves",
    failoverPolicy: "intra_leaf_only",
    disableCrossProviderFailover: true,
    groupId: input.groupId,
    useCase: input.useCase,
  };
}

/** Metadata stamps for one fanout leaf execution (pins provider; intra-leaf failover only). */
export function buildGenerationFanoutLeafMetadata(input: {
  readonly plan: Pick<
    GenerationFanoutContract,
    "groupId" | "disableCrossProviderFailover" | "targets"
  >;
  readonly target: GenerationFanoutTarget;
  readonly matrixFailoverChain?: readonly FanoutFailoverCandidate[];
}): GenerationFanoutLeafMetadata {
  const siblingModelKeys = input.plan.targets
    .filter((t) => t.targetId !== input.target.targetId)
    .map((t) => `${t.providerId}::${t.modelId}`);
  return {
    generationFanoutGroupId: input.plan.groupId,
    generationFanoutTargetId: input.target.targetId,
    generationFanoutTargetIndex: input.target.index,
    generationFanoutLeaf: true,
    disableCrossProviderFailover: true,
    preferredProviderId: input.target.providerId,
    preferredModelId: input.target.modelId,
    requestedProvider: input.target.providerId,
    requestedModel: input.target.modelId,
    imageFailoverChain: resolveIntraLeafFailoverChain({
      primaryProviderId: input.target.providerId,
      primaryModelId: input.target.modelId,
      matrixChain: input.matrixFailoverChain,
      excludeModelKeys: new Set(siblingModelKeys),
    }),
    // Carried to the runtime so leaf re-resolution keeps sibling exclusion.
    generationFanoutSiblingModelKeys: siblingModelKeys,
    imageProviderLabel: input.target.label,
    generationFanoutTargetAvailability: input.target.availability,
  };
}

export function isGenerationFanoutLeafMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  // Prefer explicit leaf stamp. Fallback only when a fanout target id is present
  // with cross-provider failover disabled — never treat bare
  // disableCrossProviderFailover as fanout leaf authority.
  if (metadata.generationFanoutLeaf === true) return true;
  const targetId =
    typeof metadata.generationFanoutTargetId === "string"
      ? metadata.generationFanoutTargetId.trim()
      : "";
  return (
    targetId.length > 0 && metadata.disableCrossProviderFailover === true
  );
}
