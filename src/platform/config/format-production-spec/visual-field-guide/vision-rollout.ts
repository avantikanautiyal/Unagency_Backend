/**
 * Phase 6 — Vision Field Guide rollout (separate from PRODUCTION_SPEC enforce).
 *
 * Env `VISUAL_FIELD_GUIDE_VISION=off|shadow|canary|on`
 * Default: **canary** (run vision for social/website/email when runner registered).
 *
 * - off: measured stamp only
 * - shadow: run vision for all services; stamp evidence (enforce still via PRODUCTION_SPEC)
 * - canary: vision only for PRODUCTION_SPEC canary services
 * - on: vision for all services with a recipe that has MODEL_JUDGED checks
 */

import {
  isProductionSpecCanaryService,
  type ProductionSpecCanaryService,
} from "../production-spec-rollout";

export type VisualFieldGuideVisionRollout =
  | "off"
  | "shadow"
  | "canary"
  | "on";

const ROLLOUT_VALUES = new Set<VisualFieldGuideVisionRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

export function resolveVisualFieldGuideVisionRollout(
  env: NodeJS.ProcessEnv = process.env,
): VisualFieldGuideVisionRollout {
  const raw = env.VISUAL_FIELD_GUIDE_VISION?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as VisualFieldGuideVisionRollout)) {
    return raw as VisualFieldGuideVisionRollout;
  }
  return "canary";
}

export function visualFieldGuideVisionShouldRun(input?: {
  readonly service?: string | null;
  readonly rollout?: VisualFieldGuideVisionRollout;
  readonly env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input?.env ?? process.env;
  const rollout =
    input?.rollout ?? resolveVisualFieldGuideVisionRollout(env);
  if (rollout === "off") return false;
  if (rollout === "on" || rollout === "shadow") return true;
  return isProductionSpecCanaryService(input?.service);
}

export type { ProductionSpecCanaryService };
