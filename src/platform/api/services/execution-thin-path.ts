/**
 * Thin create path — skip OS layers that dilute prompts / add latency without
 * improving product creative quality.
 *
 * Pain we explicitly decided to clear from the hot path:
 * - Full Brief/Brand/Knowledge/Plan on enhance_prompt / route_visual / task_graph_leaf
 * - Non-executing ExecutionPlan on ordinary product creates
 * - PromptCompiler re-stack when the prompt is already OS-enriched
 *
 * Task Intelligence (Phase 5) stays opt-in: enable plan for multi-deliverable,
 * execute graph via separate API, each leaf uses thin metadata.
 */

export const THIN_OS_PRODUCT_ACTIONS = new Set([
  "enhance_prompt",
  "route_visual",
  "task_graph_leaf",
]);

/** Product actions that still want Brand/Knowledge compounding, but not dead Plan. */
export const PRODUCT_CREATE_ACTIONS = new Set([
  "create_design",
  "refine_brief",
  "generate",
  "write_copy",
]);

export function productActionFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): string | undefined {
  return typeof metadata?.productAction === "string"
    ? metadata.productAction.trim()
    : undefined;
}

/**
 * Whether this create should build an ExecutionPlan (for optional task-graph).
 * Multi-deliverable / compound only — never every pitch deck.
 */
export function shouldEnableExecutionPlan(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly deliverableCount?: number;
}): boolean {
  const meta = input.metadata ?? {};
  if (meta.enableExecutionPlan === true || meta.forceReplan === true) {
    return true;
  }
  if (meta.multiDeliverable === true || meta.taskGraphRecommended === true) {
    return true;
  }
  if (meta.serviceContextKind === "compound") {
    return true;
  }
  if (
    typeof input.deliverableCount === "number" &&
    input.deliverableCount >= 2
  ) {
    return true;
  }
  return false;
}

/**
 * Metadata for Phase 5 leaf Integration runs — Brand/Knowledge already inlined
 * as DATA in the task prompt; do not re-assemble OS layers.
 */
export function buildThinTaskGraphLeafMetadata(
  base?: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    productAction: "task_graph_leaf",
    thinOsPath: true,
    taskGraphLeaf: true,
    taskGraphExecutionEnabled: true,
    skipBriefIntelligence: true,
    skipBrandKnowledge: true,
    skipBrandIntelligence: true,
    skipKnowledgeIntelligence: true,
    skipExecutionIntelligence: true,
    skipPlanning: true,
    skipPromptCompiler: true,
    skipServiceContextCheck: true,
    skipVaguePromptCheck: true,
  };
}

/**
 * Apply skip flags for thin product actions (enhance / route visuals / leaves).
 * Mutates a shallow copy — never throws.
 */
export function applyThinOsPathMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  const action = productActionFromMetadata(next);

  if (action && THIN_OS_PRODUCT_ACTIONS.has(action)) {
    next.skipBriefIntelligence = true;
    next.skipBrandKnowledge = true;
    next.skipBrandIntelligence = true;
    next.skipKnowledgeIntelligence = true;
    next.skipExecutionIntelligence = true;
    next.skipPlanning = true;
    next.skipPromptCompiler = true;
    next.thinOsPath = true;
    return next;
  }

  // Opt-in plan for multi-deliverable before the product skip-plan rule.
  if (shouldEnableExecutionPlan({ metadata: next })) {
    next.enableExecutionPlan = true;
    next.taskGraphRecommended = true;
    // Do not skip planning when multi-deliverable — Phase 5 needs the plan.
    delete next.skipExecutionIntelligence;
    delete next.skipPlanning;
  } else {
    // Product creatives: skip dead ExecutionPlan unless explicitly enabled.
    const isProductCreative =
      (action != null && PRODUCT_CREATE_ACTIONS.has(action)) ||
      typeof next.service === "string" ||
      typeof next.productPath === "string";
    if (
      isProductCreative &&
      next.enableExecutionPlan !== true &&
      next.forceReplan !== true
    ) {
      next.skipExecutionIntelligence = true;
      next.skipPlanning = true;
    }
  }

  // Already-enriched prompts should not be recompiled (PromptCompiler restack).
  if (
    next.skipPromptCompiler !== true &&
    (next.briefAware === true ||
      next.brandAware === true ||
      next.knowledgeAware === true ||
      typeof next.enrichedPrompt === "string")
  ) {
    next.skipPromptCompiler = true;
  }

  return next;
}

/** True when PromptCompiler would only re-dilute an already OS-stacked prompt. */
export function shouldSkipPromptCompiler(input: {
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly rawPrompt?: string;
}): boolean {
  const meta = input.metadata ?? {};
  if (meta.skipPromptCompiler === true || meta.thinOsPath === true) {
    return true;
  }
  const action = productActionFromMetadata(meta);
  if (action && THIN_OS_PRODUCT_ACTIONS.has(action)) return true;

  const prompt = (input.rawPrompt ?? "").trim();
  if (
    prompt.includes("[Structured Brief") ||
    prompt.includes("[Structured Brand Context") ||
    prompt.includes("[Structured Knowledge Context") ||
    prompt.startsWith("[Brand name=") ||
    prompt.startsWith("[Knowledge facts=")
  ) {
    return true;
  }
  return false;
}
