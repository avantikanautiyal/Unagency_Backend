/**
 * Build reference candidates from already-authorized CDF session pins +
 * already-loaded upstream ArtifactVersion context. No DB scans.
 */

import type { GenerationReferenceCandidate } from "./types";

/** Minimal session shape — avoids coupling this package to CDF module graph. */
export type ReferenceSessionPins = {
  readonly approvedArtifacts?: ReadonlyArray<{
    artifactId: string;
    version: number;
    artifactKey?: string;
    phaseId?: string;
  }>;
  readonly selectedArtifacts?: ReadonlyArray<{
    artifactId: string;
    version: number;
    artifactKey?: string;
    phaseId?: string;
  }>;
  readonly generatedArtifacts?: ReadonlyArray<{
    artifactId: string;
    version: number;
    artifactKey?: string;
    phaseId?: string;
  }>;
};

export type ReferenceUpstreamPin = {
  readonly artifactId: string;
  readonly version: number;
  readonly artifactKey?: string;
  readonly phaseId?: string;
  readonly sessionRole?: "approved" | "selected" | "generated";
  readonly role?: string;
  readonly data?: Record<string, unknown>;
};

function slideMetaFromData(data: Record<string, unknown> | undefined): {
  slideCount?: number;
  slideIds?: string[];
} {
  if (!data) return {};
  const slides = data.slides;
  if (!Array.isArray(slides) || slides.length === 0) return {};
  const ordered = [...slides].sort((a, b) => {
    const ao =
      a && typeof a === "object" && typeof (a as { order?: unknown }).order === "number"
        ? (a as { order: number }).order
        : 0;
    const bo =
      b && typeof b === "object" && typeof (b as { order?: unknown }).order === "number"
        ? (b as { order: number }).order
        : 0;
    return ao - bo;
  });
  const slideIds = ordered
    .map((s) =>
      s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string"
        ? String((s as { id: string }).id)
        : undefined,
    )
    .filter((x): x is string => Boolean(x));
  return { slideCount: ordered.length, slideIds };
}

function pushCandidate(
  out: GenerationReferenceCandidate[],
  seen: Set<string>,
  c: GenerationReferenceCandidate,
): void {
  const k = `${c.artifactId}@${c.version}`;
  if (seen.has(k)) return;
  seen.add(k);
  out.push(c);
}

/** Prefer upstream (has data) then fill gaps from session refs. */
export function buildGenerationReferenceCandidates(input: {
  readonly session?: ReferenceSessionPins;
  readonly upstream?: readonly ReferenceUpstreamPin[];
}): GenerationReferenceCandidate[] {
  const out: GenerationReferenceCandidate[] = [];
  const seen = new Set<string>();

  for (const u of input.upstream ?? []) {
    const slides = slideMetaFromData(u.data);
    pushCandidate(out, seen, {
      artifactId: u.artifactId,
      version: u.version,
      artifactKey: u.artifactKey,
      phaseId: u.phaseId,
      sessionRole: u.sessionRole,
      role: u.role,
      ...slides,
    });
  }

  const session = input.session;
  if (!session) return out;

  const ingest = (
    list: typeof session.approvedArtifacts,
    role: "approved" | "selected" | "generated",
  ) => {
    for (const r of list ?? []) {
      pushCandidate(out, seen, {
        artifactId: r.artifactId,
        version: r.version,
        artifactKey: r.artifactKey,
        phaseId: r.phaseId,
        sessionRole: role,
      });
    }
  };

  ingest(session.approvedArtifacts, "approved");
  ingest(session.selectedArtifacts, "selected");
  ingest(session.generatedArtifacts, "generated");

  return out;
}

/**
 * Read selected slide from execution metadata / refine scope when present.
 * Does not invent a slide.
 */
export function selectedSlideNumberFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): number | undefined {
  if (!metadata) return undefined;
  const keys = [
    "selectedSlideNumber",
    "cdfSelectedSlideNumber",
    "targetSlideNumber",
    "currentSlideNumber",
  ];
  for (const k of keys) {
    const v = metadata[k];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
      const n = Number.parseInt(v.trim(), 10);
      if (n > 0) return n;
    }
  }
  const scope =
    typeof metadata.refineScope === "string"
      ? metadata.refineScope
      : typeof metadata.lastRefineScope === "string"
        ? metadata.lastRefineScope
        : undefined;
  if (scope) {
    const m = scope.match(/\bslide\s*#?\s*(\d+)\b/i);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > 0) return n;
    }
  }
  return undefined;
}

export function ctiHintFromMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): { artifactId?: string; version?: number } {
  if (!metadata) return {};
  const artifactId =
    typeof metadata.referencedArtifactId === "string"
      ? metadata.referencedArtifactId.trim()
      : typeof metadata.ctiReferencedArtifactId === "string"
        ? metadata.ctiReferencedArtifactId.trim()
        : undefined;
  const versionRaw =
    metadata.referencedArtifactVersion ?? metadata.ctiReferencedArtifactVersion;
  const version =
    typeof versionRaw === "number"
      ? versionRaw
      : typeof versionRaw === "string" && /^\d+$/.test(versionRaw)
        ? Number.parseInt(versionRaw, 10)
        : undefined;
  return {
    ...(artifactId ? { artifactId } : {}),
    ...(version && version > 0 ? { version } : {}),
  };
}
