/**
 * Phase 5 — Format & Production Spec rollout flag.
 * Pattern: off → shadow → canary → on (matches continuity / Creative QA).
 *
 * Env `PRODUCTION_SPEC=off|shadow|canary|on`
 * Default **on** (Phases 1–4 already ship inject + enforce).
 * Phase 6 Visual Field Guide rides the same flag (inject via prompt block;
 * measured evidence via buildProductionGateFromExecutionContext).
 *
 * Optional override: `PRODUCTION_SPEC_PROMPT_INJECT=off|shadow|on`
 *   shadow = inject + log; does not by itself change gate behaviour.
 *
 * Canary services (full inject + enforce + pre-gen hold): social, website, email.
 * Other services under canary: inject + observe (shadow enforce).
 */

export type ProductionSpecRollout = "off" | "shadow" | "canary" | "on";

const ROLLOUT_VALUES = new Set<ProductionSpecRollout>([
  "off",
  "shadow",
  "canary",
  "on",
]);

/** Services that receive hard enforce under canary. */
export const PRODUCTION_SPEC_CANARY_SERVICES = Object.freeze([
  "social",
  "website",
  "email",
] as const);

export type ProductionSpecCanaryService =
  (typeof PRODUCTION_SPEC_CANARY_SERVICES)[number];

function normalizeServiceKey(service?: string | null): string | undefined {
  if (!service) return undefined;
  const s = service.trim().toLowerCase();
  if (!s) return undefined;
  if (s === "web" || s === "web-tech" || s.includes("website") || s.includes("site")) {
    return "website";
  }
  if (s.includes("email")) return "email";
  if (s.includes("social")) return "social";
  return s;
}

export function isProductionSpecCanaryService(
  service?: string | null,
): boolean {
  const key = normalizeServiceKey(service);
  if (!key) return false;
  return (PRODUCTION_SPEC_CANARY_SERVICES as readonly string[]).includes(key);
}

export function resolveProductionSpecRollout(
  env: NodeJS.ProcessEnv = process.env,
): ProductionSpecRollout {
  const raw = env.PRODUCTION_SPEC?.trim().toLowerCase();
  if (raw && ROLLOUT_VALUES.has(raw as ProductionSpecRollout)) {
    return raw as ProductionSpecRollout;
  }
  return "on";
}

export type ProductionSpecPromptInjectMode = "off" | "shadow" | "on";

/**
 * Prompt-inject mode. Explicit PRODUCTION_SPEC_PROMPT_INJECT wins;
 * otherwise derived from PRODUCTION_SPEC.
 */
export function resolveProductionSpecPromptInject(
  env: NodeJS.ProcessEnv = process.env,
  rollout: ProductionSpecRollout = resolveProductionSpecRollout(env),
): ProductionSpecPromptInjectMode {
  const raw = env.PRODUCTION_SPEC_PROMPT_INJECT?.trim().toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "on") return raw;
  if (rollout === "off") return "off";
  if (rollout === "shadow") return "shadow";
  return "on";
}

export function productionSpecShouldInject(input?: {
  readonly service?: string | null;
  readonly rollout?: ProductionSpecRollout;
  readonly promptInject?: ProductionSpecPromptInjectMode;
  readonly env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input?.env ?? process.env;
  const promptInject =
    input?.promptInject ??
    resolveProductionSpecPromptInject(
      env,
      input?.rollout ?? resolveProductionSpecRollout(env),
    );
  return promptInject !== "off";
}

/**
 * Whether gate failures / R-H pre-gen holds actually block.
 * shadow → observe only; canary → only listed services; on → always.
 */
export function productionSpecShouldEnforce(input?: {
  readonly service?: string | null;
  readonly rollout?: ProductionSpecRollout;
  readonly env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input?.env ?? process.env;
  const rollout = input?.rollout ?? resolveProductionSpecRollout(env);
  if (rollout === "off" || rollout === "shadow") return false;
  if (rollout === "on") return true;
  return isProductionSpecCanaryService(input?.service);
}

export function productionSpecObservesOnly(input?: {
  readonly service?: string | null;
  readonly rollout?: ProductionSpecRollout;
  readonly env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input?.env ?? process.env;
  const rollout = input?.rollout ?? resolveProductionSpecRollout(env);
  if (rollout === "shadow") return true;
  if (rollout === "canary" && !isProductionSpecCanaryService(input?.service)) {
    return true;
  }
  return false;
}
