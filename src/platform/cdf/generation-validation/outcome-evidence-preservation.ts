/**
 * Durable outcome-evidence preservation.
 *
 * A canonical-completion write (e.g. an idempotent-replay pass that only
 * re-establishes artifact identity) owns identity/completion fields — it does
 * NOT own structural/composition verification evidence. When such a write
 * does not itself carry fresher evidence, any already-established evidence
 * for the SAME exact canonical ArtifactVersion must survive the write.
 *
 * Field ownership:
 *   - canonical completion (identity/version/key/completion flags): owned by
 *     the canonical-ingest writer, always authoritative from the incoming write.
 *   - structural/composition verification evidence: owned by the structural
 *     verifier. A later canonical-completion-only write may not erase it.
 *
 * This is intentionally NOT a blind object merge: only the specific evidence
 * keys below are ever backfilled, only when the incoming write is silent on
 * that key (undefined — a fresher explicit value always wins), and only when
 * the existing evidence is proven to belong to the exact same X@V the
 * incoming write is establishing. A write with no canonical identity (a hard
 * failure / rejection) never inherits prior evidence — hard failures stay hard.
 */

/** Structural/composition verification fields — never owned by canonical-completion writers. */
export const STRUCTURAL_EVIDENCE_FIELD_KEYS = Object.freeze([
  "cdfStructuralComplianceStatus",
  "cdfStructuralCompliance",
  "cdfCompositionOutcome",
  "cdfCompositionFailureReason",
] as const);

export type StructuralEvidenceFieldKey =
  (typeof STRUCTURAL_EVIDENCE_FIELD_KEYS)[number];

export type CanonicalArtifactIdentity = Readonly<{
  artifactId: string;
  artifactVersion: number;
}>;

/** Exact canonical artifact X@V a record is stamped with, if any. */
export function extractCanonicalArtifactIdentity(
  data: Record<string, unknown> | null | undefined,
): CanonicalArtifactIdentity | null {
  if (!data) return null;
  const id = data.cdfArtifactId;
  const version = data.cdfArtifactVersion;
  if (typeof id !== "string" || !id.trim().startsWith("cdfart_")) return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return null;
  }
  return Object.freeze({ artifactId: id.trim(), artifactVersion: version });
}

export function sameCanonicalArtifactIdentity(
  a: CanonicalArtifactIdentity | null,
  b: CanonicalArtifactIdentity | null,
): boolean {
  return (
    a != null &&
    b != null &&
    a.artifactId === b.artifactId &&
    a.artifactVersion === b.artifactVersion
  );
}

/** Backfill only the evidence keys the incoming record is silent on. */
function backfillEvidenceFields(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return incoming;
  let merged = incoming;
  for (const key of STRUCTURAL_EVIDENCE_FIELD_KEYS) {
    if (merged[key] === undefined && existing[key] !== undefined) {
      if (merged === incoming) merged = { ...incoming };
      merged[key] = existing[key];
    }
  }
  return merged;
}

/**
 * Merge an incoming (freshly written) evidence-bearing record with the
 * existing durable one, preserving established structural evidence only when
 * both records identify the exact same canonical ArtifactVersion.
 */
export function mergePreservingEstablishedOutcomeEvidence(input: {
  readonly existing: Record<string, unknown> | null | undefined;
  readonly incoming: Record<string, unknown>;
}): Record<string, unknown> {
  if (!input.existing) return input.incoming;
  const existingIdentity = extractCanonicalArtifactIdentity(input.existing);
  const incomingIdentity = extractCanonicalArtifactIdentity(input.incoming);
  if (!sameCanonicalArtifactIdentity(existingIdentity, incomingIdentity)) {
    return input.incoming;
  }
  return backfillEvidenceFields(input.existing, input.incoming);
}

type ResultPayloadLike = Readonly<{
  kind: string;
  data?: unknown;
  text?: string;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Apply outcome-evidence preservation to an execution result payload.
 * A no-op (returns `incoming` unchanged, same reference) whenever there is
 * nothing to preserve or no data object to merge into — safe to call
 * unconditionally on every canonical-completion write.
 */
export function preserveEstablishedOutcomeEvidenceOnResultData<
  T extends ResultPayloadLike,
>(existingResult: T | null | undefined, incomingResult: T): T {
  const incomingData = asRecord(incomingResult?.data);
  if (!incomingData) return incomingResult;
  const existingData = asRecord(existingResult?.data);
  const merged = mergePreservingEstablishedOutcomeEvidence({
    existing: existingData,
    incoming: incomingData,
  });
  if (merged === incomingData) return incomingResult;
  return { ...incomingResult, data: merged };
}
