/**
 * Durable website (deferred_website) completion representation.
 *
 * Materialization creates art_webexport_* ZIP/HTML pairs. Those are export
 * media — never cdfart_* identity. Completion authority is:
 *   exact project (ZIP) + HTML preview representation + persisted stamps.
 */

export type WebsiteCanonicalCompletionStamp = {
  readonly websiteCanonicalCompletionEstablished: true;
  readonly websiteCompletionKind: "deferred_website";
  readonly projectArtifactId: string;
  readonly htmlArtifactId?: string;
  readonly websitePreviewArtifactId?: string;
  readonly websiteExportArtifactIds: readonly string[];
  /** Preview is resolvable via async-media artifact content for htmlArtifactId. */
  readonly websitePreviewRepresentation: "html_artifact" | "zip_only";
};

function asTrimmedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function looksLikeWebsiteExportId(id: string): boolean {
  return /webexport/i.test(id);
}

function pairWebsiteExportArtifacts(
  ids: readonly string[],
): { projectArtifactId: string; htmlArtifactId?: string }[] {
  const pairs: { projectArtifactId: string; htmlArtifactId?: string }[] = [];
  for (let i = 0; i < ids.length; i += 2) {
    const projectArtifactId = ids[i];
    if (!projectArtifactId) continue;
    const htmlArtifactId = ids[i + 1];
    pairs.push({
      projectArtifactId,
      ...(htmlArtifactId ? { htmlArtifactId } : {}),
    });
  }
  return pairs;
}

/**
 * True when export artifacts / stamps prove website materialization completed.
 * Does not invent preview URLs; only recognizes durable artifact identity.
 */
export function hasWebsiteMaterializationEvidence(input: {
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[] | null;
  readonly resultData?: Readonly<Record<string, unknown>> | null;
}): boolean {
  const stamp = resolveWebsiteCanonicalCompletionStamp(input);
  return stamp != null;
}

/**
 * Build / recover the authoritative website completion stamp from execution surfaces.
 * Prefer explicit html/project ids; fall back to ordered webexport ZIP/HTML pairs.
 */
export function resolveWebsiteCanonicalCompletionStamp(input: {
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly structuredData?: unknown;
  readonly mediaArtifactIds?: readonly string[] | null;
  readonly resultData?: Readonly<Record<string, unknown>> | null;
}): WebsiteCanonicalCompletionStamp | null {
  const meta = input.metadata ?? {};
  const result = input.resultData ?? {};
  const structured =
    input.structuredData &&
    typeof input.structuredData === "object" &&
    !Array.isArray(input.structuredData)
      ? (input.structuredData as Record<string, unknown>)
      : undefined;

  const exportIds = (input.mediaArtifactIds ?? []).filter(
    (id): id is string =>
      typeof id === "string" && id.trim().length > 0 && looksLikeWebsiteExportId(id),
  );

  const projectArtifactId =
    asTrimmedId(result.projectArtifactId) ||
    asTrimmedId(meta.projectArtifactId) ||
    asTrimmedId(structured?.projectArtifactId) ||
    (exportIds.length > 0 ? pairWebsiteExportArtifacts(exportIds)[0]?.projectArtifactId : undefined);

  const htmlArtifactId =
    asTrimmedId(result.htmlArtifactId) ||
    asTrimmedId(meta.htmlArtifactId) ||
    asTrimmedId(structured?.htmlArtifactId) ||
    (exportIds.length > 0 ? pairWebsiteExportArtifacts(exportIds)[0]?.htmlArtifactId : undefined);

  if (!projectArtifactId && !htmlArtifactId) {
    // Multi-route: any route-level stamp counts.
    const routes = Array.isArray(result.routes)
      ? result.routes
      : Array.isArray(structured?.routes)
        ? structured!.routes
        : [];
    for (const route of routes) {
      if (!route || typeof route !== "object") continue;
      const r = route as Record<string, unknown>;
      const p = asTrimmedId(r.projectArtifactId);
      const h = asTrimmedId(r.htmlArtifactId);
      if (p || h) {
        return Object.freeze({
          websiteCanonicalCompletionEstablished: true as const,
          websiteCompletionKind: "deferred_website" as const,
          projectArtifactId: p ?? h!,
          ...(h ? { htmlArtifactId: h, websitePreviewArtifactId: h } : {}),
          websiteExportArtifactIds: Object.freeze(
            exportIds.length > 0
              ? exportIds
              : [p, h].filter((x): x is string => typeof x === "string"),
          ),
          websitePreviewRepresentation: h
            ? ("html_artifact" as const)
            : ("zip_only" as const),
        });
      }
    }
    return null;
  }

  const previewId = htmlArtifactId;
  return Object.freeze({
    websiteCanonicalCompletionEstablished: true as const,
    websiteCompletionKind: "deferred_website" as const,
    projectArtifactId: projectArtifactId ?? htmlArtifactId!,
    ...(htmlArtifactId ? { htmlArtifactId } : {}),
    ...(previewId ? { websitePreviewArtifactId: previewId } : {}),
    websiteExportArtifactIds: Object.freeze(
      exportIds.length > 0
        ? exportIds
        : [projectArtifactId, htmlArtifactId].filter(
            (x): x is string => typeof x === "string",
          ),
    ),
    websitePreviewRepresentation: previewId
      ? ("html_artifact" as const)
      : ("zip_only" as const),
  });
}

/** Merge stamp onto metadata / result bags without overwriting cdfart_* identity. */
export function mergeWebsiteCanonicalCompletionStamp(
  target: Record<string, unknown> | null | undefined,
  stamp: WebsiteCanonicalCompletionStamp,
): Record<string, unknown> {
  const base = target && typeof target === "object" ? { ...target } : {};
  // Never promote art_webexport to cdfArtifactId.
  const existingCdf =
    typeof base.cdfArtifactId === "string" ? base.cdfArtifactId.trim() : "";
  if (existingCdf.startsWith("art_")) {
    delete base.cdfArtifactId;
    delete base.cdfArtifactVersion;
  }
  return {
    ...base,
    ...stamp,
    exportKind:
      typeof base.exportKind === "string" && base.exportKind.trim()
        ? base.exportKind
        : "website",
  };
}

export function isDeferredWebsiteOutputKind(
  outputKind: unknown,
): boolean {
  return (
    typeof outputKind === "string" &&
    (outputKind.trim() === "deferred_website" ||
      outputKind.trim() === "website")
  );
}
