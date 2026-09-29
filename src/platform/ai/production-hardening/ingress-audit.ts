/**
 * Phase 21 — Code-backed canonical generation ingress audit.
 * One eligibility policy; callers must gate or be intentionally exempt.
 */

export type IngressEligibilityStatus =
  | "gated_via_apply"
  | "gated_via_action_execution"
  | "gated_via_eligibility_direct"
  | "intentionally_exempt_non_model"
  | "intentionally_legacy_spine";

export type CanonicalIngressRow = {
  readonly ingressId: string;
  readonly surface: string;
  readonly entry: string;
  readonly resolvesEligibility: boolean;
  readonly respectsGenFlag: boolean;
  readonly respectsRolloutStage: boolean;
  readonly respectsClassAAllowlist: boolean;
  readonly failClosed: boolean;
  readonly preservesLegacy: boolean;
  readonly status: IngressEligibilityStatus;
  readonly notes: string;
};

/**
 * Authoritative inventory of model-generation / related ingresses.
 * Eligibility authority: resolveCanonicalGenerationEligibility → apply / Action Execution.
 */
export const CANONICAL_INGRESS_AUDIT: readonly CanonicalIngressRow[] = [
  {
    ingressId: "chat_web_mobile",
    surface: "GET/POST /chat → service AI → executions",
    entry: "routes/chat.route.ts → execution create",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes:
      "Shared web/mobile surface; canonical only via execution-create-prepass → orchestrate → tryApply",
  },
  {
    ingressId: "http_executions_create",
    surface: "POST /v1/executions",
    entry: "execution-create-prepass → orchestrateCanonicalGenerationContext",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Primary HTTP create; DirectExecutionEngine remains spine",
  },
  {
    ingressId: "direct_execution_engine",
    surface: "DirectExecutionEngine.run",
    entry: "src/platform/direct/direct-execution-engine.ts",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "intentionally_legacy_spine",
    notes:
      "Does not choose canonical itself; receives already-gated metadata/prompt from prepass apply",
  },
  {
    ingressId: "action_execution_model_generation",
    surface: "executeCanonicalAction MODEL_GENERATION",
    entry: "action-execution/modes/model-generation.ts",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_action_execution",
    notes: "Calls resolveCanonicalGenerationEligibility before orchestrate",
  },
  {
    ingressId: "cdf_apply_bridge",
    surface: "tryApplyCanonicalGenerationContext",
    entry: "cdf/generation-context/apply.ts",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Central apply gate used by orchestrator / prepass / harnesses",
  },
  {
    ingressId: "context_orchestrator",
    surface: "orchestrateCanonicalGenerationContext",
    entry: "ai/context-orchestrator/orchestrate.ts",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Delegates to tryApplyCanonicalGenerationContext (no duplicate policy)",
  },
  {
    ingressId: "presentation_generation",
    surface: "presentation CDF phases",
    entry: "cdf.phase.presentation.*.generate + ingest bridge",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Class-A; Stage 2 eligible when serviceId=presentation",
  },
  {
    ingressId: "packaging_generation",
    surface: "packaging CDF phases",
    entry: "cdf.phase.packaging.*.generate + ingest bridge",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Class-A; Stage 2 eligible when serviceId=packaging",
  },
  {
    ingressId: "social_media_generation",
    surface: "social-media CDF phases",
    entry: "cdf.phase.social-media.*.generate + ingest bridge",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Class-A; Stage 2 eligible when serviceId=social-media",
  },
  {
    ingressId: "class_d_generation",
    surface: "12 Class-D CDF services",
    entry: "cdf.phase.<service>.*.generate",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Stage 2 → canonical for any CDF-registered service; Class-A is adapter overlay only",
  },
  {
    ingressId: "refinement_generation",
    surface: "CDF refine + OS refinements",
    entry: "refinement services → create path",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_apply",
    notes: "Model refine goes through create/apply; deterministic refine exempt below",
  },
  {
    ingressId: "cdf_select_approve",
    surface: "CDF select / approve transitions",
    entry: "applyCdfTransition",
    resolvesEligibility: false,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "intentionally_exempt_non_model",
    notes: "Deterministic state machine — no Model Runtime",
  },
  {
    ingressId: "render_materialize_export",
    surface: "render / materialize / export",
    entry: "RENDER_EXPORT / materialize actions",
    resolvesEligibility: false,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "intentionally_exempt_non_model",
    notes: "Non-model generation; must not invoke Model Runtime",
  },
  {
    ingressId: "http_qa_seam",
    surface: "optional post-create Output QA",
    entry: "maybeRunHttpCreateOutputQa",
    resolvesEligibility: true,
    respectsGenFlag: true,
    respectsRolloutStage: true,
    respectsClassAAllowlist: true,
    failClosed: true,
    preservesLegacy: true,
    status: "gated_via_eligibility_direct",
    notes: "Default OFF; repair requires QA ON + eligible GEN + INVALID",
  },
];

export function listCanonicalIngressAudit(): readonly CanonicalIngressRow[] {
  return CANONICAL_INGRESS_AUDIT;
}

export function assertAllModelIngressesGated(): {
  readonly ok: true;
  readonly ungated: readonly string[];
} {
  const ungated = CANONICAL_INGRESS_AUDIT.filter(
    (r) =>
      r.status !== "intentionally_exempt_non_model" &&
      r.status !== "intentionally_legacy_spine" &&
      !r.resolvesEligibility,
  ).map((r) => r.ingressId);
  if (ungated.length > 0) {
    throw new Error(`Ungated model ingresses: ${ungated.join(", ")}`);
  }
  return { ok: true, ungated: [] };
}
