/**
 * Track B3 — Creative QA rollout flag (independent of A3 post-guards).
 */

import {
  getContinuityLayerFlag,
  parseContinuityRolloutEnv,
  continuityLayerAffectsGeneration,
  type ContinuityLayerRollout,
} from "../../creative/continuity-layer-flags";

const ROLLOUT_VALUES = new Set<ContinuityLayerRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/** Env `CREATIVE_QA=off|shadow|canary|on` — B3 creative score release gate. */
export function resolveCreativeQaRollout(
  env: NodeJS.ProcessEnv = process.env
): ContinuityLayerRollout {
  const raw = env.CREATIVE_QA?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ContinuityLayerRollout)) {
    return raw as ContinuityLayerRollout;
  }
  return getContinuityLayerFlag("CreativeQa")?.rollout ?? "off";
}

export function creativeQaBlocksRelease(rollout?: ContinuityLayerRollout): boolean {
  const r = rollout ?? resolveCreativeQaRollout();
  return continuityLayerAffectsGeneration(r);
}

export function creativeQaObservesOnly(rollout?: ContinuityLayerRollout): boolean {
  const r = rollout ?? resolveCreativeQaRollout();
  return r === "shadow";
}
