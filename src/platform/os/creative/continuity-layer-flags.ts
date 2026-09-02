/**
 * Track A Phase 0 — continuity layer rollout flags.
 * Default OFF. Pattern: off → shadow → canary → on (or kill).
 *
 * These are contracts + helpers only. Create path does not read them yet.
 */

export type ContinuityLayerRollout = "off" | "shadow" | "canary" | "on";

export type ContinuityLayerId =
  | "BrandMemoryPlane"
  | "IntentGate"
  | "KnowledgeResolver"
  | "ContextBinder"
  | "PostGuardsHardRetry"
  | "ApprovePromote"
  | "MultiDeliverableOrchestrator"
  | "BriefAssist"
  | "CampaignMemory"
  | "ProductIntelligenceUx"
  | "CreativeQa";

export interface ContinuityLayerFlag {
  readonly layerId: ContinuityLayerId;
  readonly rollout: ContinuityLayerRollout;
  readonly notes: string;
}

/**
 * Authoritative default rollouts for Track A layers.
 * Nothing here enables create-path behaviour by itself.
 */
export const CONTINUITY_LAYER_FLAGS: readonly ContinuityLayerFlag[] =
  Object.freeze([
    {
      layerId: "BrandMemoryPlane",
      rollout: "off",
      notes: "Phase A1 store live in-process; create path still unbound until A2.",
    },
    {
      layerId: "IntentGate",
      rollout: "off",
      notes:
        "Phase A2 implemented (rule detector). Gated by CONTINUITY_CONTEXT_BIND with binder.",
    },
    {
      layerId: "KnowledgeResolver",
      rollout: "off",
      notes:
        "Phase A2 implemented. Slots first via Brand Memory. Gated by CONTINUITY_CONTEXT_BIND.",
    },
    {
      layerId: "ContextBinder",
      rollout: "off",
      notes:
        "Phase A2 implemented. Set CONTINUITY_CONTEXT_BIND=shadow|on. Binds packet + assetIds; never rewrites brief.",
    },
    {
      layerId: "PostGuardsHardRetry",
      rollout: "off",
      notes:
        "Phase A3 implemented. Set CONTINUITY_POST_GUARDS=shadow|on. ≤1 hard-miss retry; taste never auto-retries.",
    },
    {
      layerId: "ApprovePromote",
      rollout: "off",
      notes:
        "Phase A1 implemented. Set CONTINUITY_APPROVE_PROMOTE=shadow|on to enable. Pass brandMemory on approveVersion.",
    },
    {
      layerId: "MultiDeliverableOrchestrator",
      rollout: "off",
      notes:
        "Phase A4 implemented. Set CONTINUITY_PACKS=shadow|on. Packs only; each leaf thin + binder.",
    },
    {
      layerId: "BriefAssist",
      rollout: "off",
      notes:
        "Phase A4 implemented. Set CONTINUITY_BRIEF_ASSIST=shadow|on. Empty/vague + optInBriefAssist only.",
    },
    {
      layerId: "CampaignMemory",
      rollout: "off",
      notes:
        "Phase A5 implemented. Set CONTINUITY_CAMPAIGN_MEMORY=shadow|on. Packs→working, selection signals, rebrand archive.",
    },
    {
      layerId: "ProductIntelligenceUx",
      rollout: "off",
      notes:
        "Phase A6 implemented. Set CONTINUITY_PRODUCT_UX=shadow|on. Slot awareness + contradiction ASK; FE helpers.",
    },
    {
      layerId: "CreativeQa",
      rollout: "off",
      notes:
        "Track B3 implemented. Set CREATIVE_QA=shadow|on. 10-dimension creative score; block release below 80/100.",
    },
  ]);

export function getContinuityLayerFlag(
  layerId: ContinuityLayerId
): ContinuityLayerFlag | undefined {
  return CONTINUITY_LAYER_FLAGS.find((f) => f.layerId === layerId);
}

export function continuityLayerAffectsGeneration(
  rollout: ContinuityLayerRollout
): boolean {
  return rollout === "canary" || rollout === "on";
}

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/**
 * Resolve ApprovePromote rollout.
 * Env `CONTINUITY_APPROVE_PROMOTE=off|shadow|canary|on` overrides the table default.
 */
export function resolveApprovePromoteRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CONTINUITY_APPROVE_PROMOTE?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("ApprovePromote")?.rollout ?? "off";
}

/** Shared env parse for continuity layer flags. */
export function parseContinuityRolloutEnv(
  raw: string | undefined
): ContinuityLayerRollout | undefined {
  const v = raw?.trim().toLowerCase();
  if (v && ROLLOUT_VALUES.has(v as ContinuityLayerRollout)) {
    return v as ContinuityLayerRollout;
  }
  return undefined;
}
