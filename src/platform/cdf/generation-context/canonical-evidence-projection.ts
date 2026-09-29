/**
 * Authoritative evidence projection for CDF generation diagnostics.
 *
 * ONE generationContextHash source of truth:
 *   computeGenerationContextHash → request.generationContextHash
 *   stamped as metadata.cdfCanonicalContextHash
 *   copied to CMR metadata.generationContextHash
 *
 * Harnesses / forensics MUST read those keys — never invent a secondary hash.
 *
 * Selected route pin:
 *   SelectedSemanticChoice { artifactId, version, artifactKey }
 *   identity string: `${artifactId}@${version}#${choiceArrayKey}[${index}]`
 *   CMR part: selected_semantic_directions
 */

import { CDF_CANONICAL_CONTEXT_META } from "./flag";

export type SelectedRouteArtifactPin = Readonly<{
  artifactId: string;
  version: number;
  artifactKey: string | null;
  selectedRouteIndex: number | null;
  choiceArrayKey: string | null;
  /** Compact identity when available: X@V#routes[i] */
  selectedDirectionIdentity: string | null;
  source:
    | "metadata_structured"
    | "metadata_identity"
    | "cmr_selected_semantic_directions"
    | "none";
}>;

type CmrLike = Readonly<{
  metadata?: Readonly<Record<string, unknown>> | null;
  messages?: ReadonlyArray<{
    content?: ReadonlyArray<{
      type?: string;
      name?: string;
      semanticRole?: string;
      data?: unknown;
    }>;
  }>;
}>;

/**
 * Resolve the single authoritative generationContextHash.
 * Returns null when absent — callers must not synthesize a substitute.
 */
export function resolveAuthoritativeGenerationContextHash(input: {
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly cmr?: CmrLike | null;
}): string | null {
  const meta = input.metadata ?? {};
  const stamped = meta[CDF_CANONICAL_CONTEXT_META.hash];
  if (typeof stamped === "string" && stamped.trim()) return stamped.trim();

  const cmrMetaHash = input.cmr?.metadata?.generationContextHash;
  if (typeof cmrMetaHash === "string" && cmrMetaHash.trim()) {
    return cmrMetaHash.trim();
  }

  // Legacy / mistaken keys — accept only if they match real stamp semantics,
  // never invent. Prefer null over a SHA-of-fingerprint substitute.
  const loose = meta.generationContextHash;
  if (typeof loose === "string" && loose.trim()) return loose.trim();

  return null;
}

/** Parse stamped identity: artifactId@version#choiceArrayKey[index] */
export function parseSelectedDirectionIdentity(
  identity: string,
): Omit<SelectedRouteArtifactPin, "source" | "artifactKey"> & {
  artifactKey: null;
} | null {
  const raw = identity.trim();
  if (!raw) return null;
  const m = raw.match(
    /^([^@]+)@(\d+)(?:#([^\[]+)\[(\d+)\])?$/,
  );
  if (!m) return null;
  return {
    artifactId: m[1]!,
    version: Number(m[2]),
    artifactKey: null,
    choiceArrayKey: m[3] ?? null,
    selectedRouteIndex: m[4] != null ? Number(m[4]) : null,
    selectedDirectionIdentity: raw,
  };
}

function cmrSelectedDirections(cmr: CmrLike | null | undefined): ReadonlyArray<{
  artifactId?: unknown;
  version?: unknown;
  artifactKey?: unknown;
  selectedRouteIndex?: unknown;
  choiceArrayKey?: unknown;
}> {
  const parts = (cmr?.messages ?? []).flatMap((m) => m.content ?? []);
  const part = parts.find(
    (p) =>
      p.name === "selected_semantic_directions" ||
      p.semanticRole === "selected_semantic_direction",
  );
  const data = part?.data;
  if (Array.isArray(data)) return data as never;
  if (data && typeof data === "object") {
    const values = Object.values(data as Record<string, unknown>);
    if (values.every((v) => v && typeof v === "object")) {
      return values as never;
    }
  }
  return [];
}

/**
 * Resolve exact selected ArtifactVersion pin used by execution.
 * Prefer structured metadata stamps, then identity parse, then CMR directions.
 */
export function resolveSelectedRouteArtifactPin(input: {
  readonly metadata?: Readonly<Record<string, unknown>> | null;
  readonly cmr?: CmrLike | null;
}): SelectedRouteArtifactPin {
  const meta = input.metadata ?? {};

  const stampedId = meta[CDF_CANONICAL_CONTEXT_META.selectedArtifactId];
  const stampedVersion = meta[CDF_CANONICAL_CONTEXT_META.selectedArtifactVersion];
  const stampedKey = meta[CDF_CANONICAL_CONTEXT_META.selectedArtifactKey];
  const identityRaw = meta[CDF_CANONICAL_CONTEXT_META.selectedDirectionIdentity];

  if (typeof stampedId === "string" && stampedId.trim() && stampedVersion != null) {
    const version = Number(stampedVersion);
    if (Number.isFinite(version)) {
      const identity =
        typeof identityRaw === "string" && identityRaw.trim()
          ? identityRaw.trim()
          : null;
      const parsed = identity ? parseSelectedDirectionIdentity(identity) : null;
      return {
        artifactId: stampedId.trim(),
        version,
        artifactKey:
          typeof stampedKey === "string" && stampedKey.trim()
            ? stampedKey.trim()
            : null,
        selectedRouteIndex: parsed?.selectedRouteIndex ?? null,
        choiceArrayKey: parsed?.choiceArrayKey ?? null,
        selectedDirectionIdentity: identity,
        source: "metadata_structured",
      };
    }
  }

  if (typeof identityRaw === "string" && identityRaw.trim()) {
    const parsed = parseSelectedDirectionIdentity(identityRaw);
    if (parsed) {
      return {
        ...parsed,
        artifactKey: null,
        source: "metadata_identity",
      };
    }
  }

  const dirs = cmrSelectedDirections(input.cmr);
  const primary = dirs[0];
  if (
    primary &&
    typeof primary.artifactId === "string" &&
    primary.artifactId.trim() &&
    primary.version != null &&
    Number.isFinite(Number(primary.version))
  ) {
    const artifactId = primary.artifactId.trim();
    const version = Number(primary.version);
    const artifactKey =
      typeof primary.artifactKey === "string" && primary.artifactKey.trim()
        ? primary.artifactKey.trim()
        : null;
    const choiceArrayKey =
      typeof primary.choiceArrayKey === "string" ? primary.choiceArrayKey : null;
    const selectedRouteIndex =
      primary.selectedRouteIndex != null &&
      Number.isFinite(Number(primary.selectedRouteIndex))
        ? Number(primary.selectedRouteIndex)
        : null;
    const selectedDirectionIdentity =
      choiceArrayKey != null && selectedRouteIndex != null
        ? `${artifactId}@${version}#${choiceArrayKey}[${selectedRouteIndex}]`
        : `${artifactId}@${version}`;
    return {
      artifactId,
      version,
      artifactKey,
      selectedRouteIndex,
      choiceArrayKey,
      selectedDirectionIdentity,
      source: "cmr_selected_semantic_directions",
    };
  }

  return {
    artifactId: "",
    version: NaN,
    artifactKey: null,
    selectedRouteIndex: null,
    choiceArrayKey: null,
    selectedDirectionIdentity: null,
    source: "none",
  };
}

export function selectedRoutePinIsResolved(
  pin: SelectedRouteArtifactPin,
): boolean {
  return (
    pin.source !== "none" &&
    Boolean(pin.artifactId) &&
    Number.isFinite(pin.version)
  );
}
