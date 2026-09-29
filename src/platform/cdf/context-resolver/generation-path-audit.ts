/**
 * M2B generation-path audit matrix (code-backed documentation).
 * STATUS reflects wiring after Phase 2 Canonical Generation Context Bridge.
 */

export type CdfGenerationPathAuditRow = {
  path: string;
  entry: string;
  currentContextSource: string;
  m2bIntegrated: boolean;
  legacyFallback: boolean;
  contextHash: boolean;
  provenance: boolean;
  status: "integrated" | "adapter_ready" | "legacy_explicit" | "out_of_scope";
};

/**
 * Trace: actual CDF-controlled generation call paths in the monorepo.
 * "integrated" = obtains ResolvedGenerationContext (backend) before provider bind
 * when CDF_CANONICAL_GENERATION_CONTEXT=1.
 *
 * Default (flag OFF) remains legacy FE buildCdfPhasePrompt + approval notes.
 */
export const CDF_GENERATION_PATH_AUDIT: readonly CdfGenerationPathAuditRow[] = [
  {
    path: "CDF text choice (launch_routes)",
    entry:
      "buildCdfPhaseGenerationRequest → POST /executions → orchestrateCanonicalGenerationContext (flag)",
    currentContextSource:
      "Flag ON: resolveGenerationContext + exact ArtifactVersions; Flag OFF: legacy session.brief/notes",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "integrated",
  },
  {
    path: "CDF early text / structured",
    entry:
      "execution-create-prepass → orchestrateCanonicalGenerationContext → Direct",
    currentContextSource:
      "Flag ON: ResolvedGenerationContext + rehydrated upstream; Flag OFF: truncated approved.note",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "integrated",
  },
  {
    path: "CDF late structured (full-deck)",
    entry:
      "canonical context → PresentationRoutes (no concepts expansion when flag ON)",
    currentContextSource:
      "Flag ON: slide-content + design-system exact versions; Flag OFF: PresentationRouteConcepts pipeline",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "integrated",
  },
  {
    path: "CDF visual output/mockup",
    entry: "buildCdfVisualBrief → runDirectVisualRouteGeneration",
    currentContextSource:
      "Visual leaf prompts; CTI replace skipped; canonical bridge when cdfSession+phase+flag",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "adapter_ready",
  },
  {
    path: "CDF refine",
    entry: "refine transition + create with refinePrompt metadata",
    currentContextSource: "Context Resolver refinement + ActiveBrief (flag ON)",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "integrated",
  },
  {
    path: "BE resolveGenerationContext (authoritative)",
    entry: "platform/cdf/context-resolver/resolve.ts via generation-context/apply.ts",
    currentContextSource: "session + ActiveBrief@version + canonical phase",
    m2bIntegrated: true,
    legacyFallback: true,
    contextHash: true,
    provenance: true,
    status: "integrated",
  },
  {
    path: "Non-CDF Direct create",
    entry: "runCreativeRoutesGeneration without cdfPhaseId",
    currentContextSource: "raw brief + CTI/prepass (not CDF)",
    m2bIntegrated: false,
    legacyFallback: false,
    contextHash: false,
    provenance: false,
    status: "out_of_scope",
  },
  {
    path: "Config gates (generator none)",
    entry: "static routes — no generate",
    currentContextSource: "n/a",
    m2bIntegrated: false,
    legacyFallback: false,
    contextHash: false,
    provenance: false,
    status: "out_of_scope",
  },
] as const;
