/**
 * Track A Phase A0 — snapshot of all continuity layer rollouts from env.
 * Used by holdout scripts, admin diagnostics, and rollout verification.
 */

import {
  CONTINUITY_LAYER_FLAGS,
  getContinuityLayerFlag,
  parseContinuityRolloutEnv,
  resolveApprovePromoteRollout,
  type ContinuityLayerId,
  type ContinuityLayerRollout,
} from "./continuity-layer-flags";
import { resolveContextBindRollout } from "./continuity-bind-pipeline";
import { resolveProductUxRollout } from "./continuity-product-ux";
import { resolveCampaignMemoryRollout } from "./campaign-memory-service";

export interface ContinuityRolloutSnapshot {
  readonly capturedAt: string;
  readonly layers: Readonly<
    Record<
      string,
      {
        readonly rollout: ContinuityLayerRollout;
        readonly envKey?: string;
        readonly affectsGeneration: boolean;
      }
    >
  >;
  readonly recommendedDevShadow: Readonly<Record<string, ContinuityLayerRollout>>;
}

const ENV_BY_LAYER: Partial<Record<ContinuityLayerId, string>> = {
  ApprovePromote: "CONTINUITY_APPROVE_PROMOTE",
  ContextBinder: "CONTINUITY_CONTEXT_BIND",
  PostGuardsHardRetry: "CONTINUITY_POST_GUARDS",
  MultiDeliverableOrchestrator: "CONTINUITY_PACKS",
  BriefAssist: "CONTINUITY_BRIEF_ASSIST",
  CampaignMemory: "CONTINUITY_CAMPAIGN_MEMORY",
  ProductIntelligenceUx: "CONTINUITY_PRODUCT_UX",
};

/** Internal dev shadow — observe bind + promote without blocking create. */
export const RECOMMENDED_DEV_SHADOW_ROLLOUT: Readonly<
  Record<string, ContinuityLayerRollout>
> = Object.freeze({
  CONTINUITY_APPROVE_PROMOTE: "shadow",
  CONTINUITY_CONTEXT_BIND: "shadow",
  CONTINUITY_POST_GUARDS: "shadow",
  CONTINUITY_PRODUCT_UX: "shadow",
  CONTINUITY_PACKS: "off",
  CONTINUITY_BRIEF_ASSIST: "off",
  CONTINUITY_CAMPAIGN_MEMORY: "off",
});

function affectsGeneration(rollout: ContinuityLayerRollout): boolean {
  return rollout === "canary" || rollout === "on";
}

function resolveLayerRollout(
  layerId: ContinuityLayerId,
  env: NodeJS.ProcessEnv
): ContinuityLayerRollout {
  switch (layerId) {
    case "ApprovePromote":
      return resolveApprovePromoteRollout(env);
    case "ContextBinder":
    case "IntentGate":
    case "KnowledgeResolver":
      return resolveContextBindRollout(env);
    case "PostGuardsHardRetry":
      return (
        parseContinuityRolloutEnv(env.CONTINUITY_POST_GUARDS) ??
        getContinuityLayerFlag("PostGuardsHardRetry")?.rollout ??
        "off"
      );
    case "MultiDeliverableOrchestrator":
      return (
        parseContinuityRolloutEnv(env.CONTINUITY_PACKS) ??
        getContinuityLayerFlag("MultiDeliverableOrchestrator")?.rollout ??
        "off"
      );
    case "BriefAssist":
      return (
        parseContinuityRolloutEnv(env.CONTINUITY_BRIEF_ASSIST) ??
        getContinuityLayerFlag("BriefAssist")?.rollout ??
        "off"
      );
    case "CampaignMemory":
      return resolveCampaignMemoryRollout(env);
    case "ProductIntelligenceUx":
      return resolveProductUxRollout(env);
    default:
      return getContinuityLayerFlag(layerId)?.rollout ?? "off";
  }
}

export function captureContinuityRolloutSnapshot(
  env: NodeJS.ProcessEnv = process.env
): ContinuityRolloutSnapshot {
  const layers: Record<
    string,
    {
      rollout: ContinuityLayerRollout;
      envKey?: string;
      affectsGeneration: boolean;
    }
  > = {};

  for (const flag of CONTINUITY_LAYER_FLAGS) {
    const rollout = resolveLayerRollout(flag.layerId, env);
    layers[flag.layerId] = {
      rollout,
      envKey: ENV_BY_LAYER[flag.layerId],
      affectsGeneration: affectsGeneration(rollout),
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    layers,
    recommendedDevShadow: RECOMMENDED_DEV_SHADOW_ROLLOUT,
  };
}

export function continuityRolloutSummary(
  snapshot: ContinuityRolloutSnapshot
): string {
  const lines = [`Continuity rollout @ ${snapshot.capturedAt}`, ""];
  for (const [layerId, row] of Object.entries(snapshot.layers)) {
    const envHint = row.envKey ? ` (${row.envKey}=${row.rollout})` : "";
    const gen = row.affectsGeneration ? " [affects create]" : "";
    lines.push(`  ${layerId}: ${row.rollout}${envHint}${gen}`);
  }
  return lines.join("\n");
}
