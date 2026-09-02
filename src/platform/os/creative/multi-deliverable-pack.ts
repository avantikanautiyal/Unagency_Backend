/**
 * Track A Phase A4 — Multi-deliverable pack planner (packs only).
 * Each leaf stays thin + binder; never a TaskGraph revival.
 */

import {
  continuityLayerAffectsGeneration,
  getContinuityLayerFlag,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { logOsExecutionEvent } from "../observability/execution-log";

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/** Env `CONTINUITY_PACKS=off|shadow|canary|on` overrides table default. */
export function resolvePacksRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CONTINUITY_PACKS?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("MultiDeliverableOrchestrator")?.rollout ?? "off";
}

export const MAX_PACK_LEAVES = 12;

export interface PackLeafSpec {
  readonly leafIndex: number;
  readonly title: string;
  /** Leaf brief — derived from parent without enrichment novels. */
  readonly prompt: string;
  readonly capabilityHint?: string;
}

export interface PackPlan {
  readonly packId: string;
  readonly packKind: "social_set" | "brand_kit" | "generic_count";
  readonly leafCount: number;
  readonly leaves: readonly PackLeafSpec[];
  /** Only the first leaf runs on this create; rest are a plan for product UX. */
  readonly activeLeafIndex: number;
}

const COUNT_RE =
  /\b(?:make|create|generate|produce)\s+(\d{1,2})\s+(?:[\w-]+\s+){0,3}(?:social\s+)?(?:posts?|variants?|options?|images?|ads?|captions?)\b/i;
const BRAND_KIT_RE =
  /\b(?:brand\s+kit|identity\s+kit|logo\s+suite|full\s+brand\s+package)\b/i;
const SOCIAL_SET_RE =
  /\b(?:content\s+pack|post\s+pack|social\s+pack|carousel\s+set)\b/i;

export function detectPackIntent(input: {
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): {
  readonly isPack: boolean;
  readonly packKind: PackPlan["packKind"];
  readonly requestedCount: number;
} | null {
  const meta = input.metadata ?? {};
  const explicitPack =
    meta.packRequest === true ||
    meta.continuityPack === true ||
    (typeof meta.packSize === "number" && meta.packSize >= 2) ||
    (typeof meta.packSize === "string" && Number(meta.packSize) >= 2);

  const packSizeRaw =
    typeof meta.packSize === "number"
      ? meta.packSize
      : typeof meta.packSize === "string"
        ? Number(meta.packSize)
        : undefined;

  const brief = input.brief.trim();
  const countMatch = brief.match(COUNT_RE);
  const fromBrief = countMatch ? Number(countMatch[1]) : undefined;

  let count =
    typeof packSizeRaw === "number" && Number.isFinite(packSizeRaw)
      ? Math.floor(packSizeRaw)
      : fromBrief;

  let packKind: PackPlan["packKind"] = "generic_count";
  if (BRAND_KIT_RE.test(brief) || meta.packKind === "brand_kit") {
    packKind = "brand_kit";
    count = count && count >= 2 ? count : 4;
  } else if (
    SOCIAL_SET_RE.test(brief) ||
    meta.packKind === "social_set" ||
    (fromBrief != null && /social|post|caption/i.test(brief))
  ) {
    packKind = "social_set";
  }

  if (!explicitPack && count == null && packKind === "generic_count") {
    return null;
  }
  if (!explicitPack && count == null && packKind !== "brand_kit") {
    return null;
  }

  const requestedCount = Math.min(
    MAX_PACK_LEAVES,
    Math.max(2, count ?? 2)
  );

  return { isPack: true, packKind, requestedCount };
}

export function planMultiDeliverablePack(input: {
  readonly brief: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly createId?: (prefix: string) => string;
  readonly capabilityHint?: string;
}): PackPlan | null {
  const detected = detectPackIntent(input);
  if (!detected?.isPack) return null;

  const createId = input.createId ?? ((p: string) => `${p}_${Date.now()}`);
  const leaves: PackLeafSpec[] = [];
  for (let i = 0; i < detected.requestedCount; i++) {
    const n = i + 1;
    leaves.push({
      leafIndex: i,
      title: `Pack item ${n}/${detected.requestedCount}`,
      prompt:
        detected.requestedCount <= 1
          ? input.brief
          : `${input.brief}\n\n[Pack leaf ${n} of ${detected.requestedCount} — produce only this item, consistent with the set.]`,
      capabilityHint: input.capabilityHint,
    });
  }

  return {
    packId: createId("pack"),
    packKind: detected.packKind,
    leafCount: leaves.length,
    leaves,
    activeLeafIndex: 0,
  };
}

export function applyPackPlanToMetadata(input: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly plan: PackPlan;
  readonly rollout: ContinuityLayerRollout;
}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input.metadata };
  const active = input.plan.leaves[input.plan.activeLeafIndex];
  if (input.rollout === "shadow") {
    next.packPlanShadow = input.plan;
    return next;
  }
  next.continuityPack = true;
  next.packPlan = input.plan;
  next.packLeafIndex = input.plan.activeLeafIndex;
  next.multiDeliverable = {
    packId: input.plan.packId,
    leafCount: input.plan.leafCount,
    activeLeafIndex: input.plan.activeLeafIndex,
    packKind: input.plan.packKind,
  };
  if (active && continuityLayerAffectsGeneration(input.rollout)) {
    next.packLeafPrompt = active.prompt;
  }
  return next;
}

export function runPackPlannerOnCreate(input: {
  readonly brief: string;
  readonly organizationId: string;
  readonly executionId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly capabilityHint?: string;
  readonly rollout?: ContinuityLayerRollout;
  readonly createId?: (prefix: string) => string;
}): {
  readonly rollout: ContinuityLayerRollout;
  readonly plan: PackPlan | null;
  readonly metadata: Record<string, unknown>;
  readonly applied: boolean;
} | null {
  const rollout = input.rollout ?? resolvePacksRollout();
  if (rollout === "off") return null;

  const plan = planMultiDeliverablePack({
    brief: input.brief,
    metadata: input.metadata,
    createId: input.createId,
    capabilityHint: input.capabilityHint,
  });
  if (!plan) {
    return {
      rollout,
      plan: null,
      metadata: { ...(input.metadata ?? {}) },
      applied: false,
    };
  }

  const metadata = applyPackPlanToMetadata({
    metadata: input.metadata ?? {},
    plan,
    rollout,
  });

  logOsExecutionEvent("continuity.pack_plan", {
    requestId: input.executionId ?? "prepass",
    executionId: input.executionId ?? "prepass",
    organizationId: input.organizationId,
    status: continuityLayerAffectsGeneration(rollout) ? "applied" : "shadow",
    capabilityId: input.capabilityHint,
  });

  return { rollout, plan, metadata, applied: true };
}
