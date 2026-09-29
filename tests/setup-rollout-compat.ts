/**
 * Jest setup — Phase 21 production contract lockdown.
 *
 * Production: unset CDF_CANONICAL_ROLLOUT_STAGE + GEN ON → legacy (no escape hatch).
 * Historical Phase 2–20 tests set GEN ON without a stage; they require this
 * explicit opt-in so unmanaged enablement is never the production default.
 *
 * Production deployments MUST NOT set CDF_CANONICAL_ROLLOUT_COMPAT.
 */
if (process.env.CDF_CANONICAL_ROLLOUT_COMPAT == null) {
  process.env.CDF_CANONICAL_ROLLOUT_COMPAT = "1";
}
