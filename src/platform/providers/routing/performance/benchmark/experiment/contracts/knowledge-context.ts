/**
 * Step 9 — Versioned knowledge-context reference model (traceability, not a second repo).
 */

export type KnowledgeScope =
  | "generic"
  | "industry"
  | "service"
  | "industry_service"
  | "brand"
  | "task_specific";

export type KnowledgeContextRef = {
  readonly knowledgeId: string;
  readonly knowledgeVersion: string;
  readonly scope: KnowledgeScope;
  readonly label?: string;
  readonly sourceReferences: readonly string[];
  readonly contentFingerprint: string;
  readonly contentPreview?: string;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

/** Legacy alias — knowledgeVersion on records maps to knowledgeId@version. */
export function knowledgeVersionTag(ref: KnowledgeContextRef): string {
  return `${ref.knowledgeId}@${ref.knowledgeVersion}`;
}

export function isKnowledgeApplicable(
  ref: KnowledgeContextRef,
  input: {
    readonly service: string;
    readonly subtype: string;
    readonly industry?: string;
    readonly benchmarkId?: string;
  },
): { readonly applicable: boolean; readonly reason?: string } {
  const meta = ref.metadata ?? {};
  const services = meta.services as readonly string[] | undefined;
  const industries = meta.industries as readonly string[] | undefined;
  const outputKinds = meta.outputKinds as readonly string[] | undefined;
  const benchmarkIds = meta.benchmarkIds as readonly string[] | undefined;

  if (benchmarkIds?.length && input.benchmarkId && !benchmarkIds.includes(input.benchmarkId)) {
    return Object.freeze({ applicable: false, reason: "benchmark not in knowledge scope" });
  }
  if (services?.length && !services.includes(input.service)) {
    return Object.freeze({ applicable: false, reason: `service ${input.service} not in knowledge scope` });
  }
  if (industries?.length && input.industry && !industries.includes(input.industry)) {
    return Object.freeze({ applicable: false, reason: `industry ${input.industry} not in knowledge scope` });
  }
  if (outputKinds?.length) {
    const kind = meta.outputKind as string | undefined;
    if (kind && !outputKinds.includes(kind)) {
      return Object.freeze({ applicable: false, reason: "outputKind not in knowledge scope" });
    }
  }
  if (ref.scope === "industry" && !input.industry) {
    return Object.freeze({ applicable: false, reason: "industry-scoped knowledge requires benchmark industry" });
  }
  if (ref.scope === "industry_service" && (!input.industry || !input.service)) {
    return Object.freeze({ applicable: false, reason: "industry_service knowledge requires industry + service" });
  }
  return Object.freeze({ applicable: true });
}

/** Inject knowledge into benchmark brief without altering the canonical benchmark definition. */
export function applyKnowledgeToBrief(
  brief: string,
  knowledge: KnowledgeContextRef,
): string {
  const preview = knowledge.contentPreview?.trim();
  if (!preview) return brief;
  return `[KNOWLEDGE CONTEXT — ${knowledge.knowledgeId} v${knowledge.knowledgeVersion}]\n${preview}\n\n[CLIENT BRIEF]\n${brief}`;
}
