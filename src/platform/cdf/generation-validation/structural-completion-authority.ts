/**
 * Structural verification vs canonical completion authority.
 *
 * Structural / composition verification is an observational quality plane.
 * Its diagnostics (`blocksCanonicalCompletion`, `canonicalIngestDecision`,
 * NON_COMPLIANT) describe what the verifier recommends — they are NOT the
 * canonical completion decision. Canonical ingest is authoritative:
 *
 *   canonical completion established (exact cdfart_*@V bound)
 *     → structural failure is a warning, never a completion failure
 *   canonical completion not established with a structural failure stamp
 *     → structural completion failure
 *
 * Typed stamps only — no free-text matching.
 */

type Meta = Readonly<Record<string, unknown>> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Structural / composition plane reported a failure (media was verified). */
export function hasStructuralFailureStamp(metadata: Meta): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  if (metadata.cdfCompositionOutcome === "COMPOSITION_FAILED") return true;
  if (metadata.cdfStructuralComplianceStatus === "NON_COMPLIANT") return true;
  const c = asRecord(metadata.cdfStructuralCompliance);
  if (!c) return false;
  return (
    c.blocksCanonicalCompletion === true ||
    c.blockingDecision === true ||
    c.canonicalIngestDecision === "blocked" ||
    c.overallStructuralVerdict === "NON_COMPLIANT" ||
    c.status === "NON_COMPLIANT"
  );
}

/** Canonical ingest accepted and bound the exact ArtifactVersion. */
export function isCanonicalCompletionEstablished(metadata: Meta): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (
    metadata.cdfCanonicalCompletionEstablished === true ||
    metadata.cdfGeneratedArtifactsBound === true
  );
}

/**
 * True only when the structural/composition plane stamped a failure AND
 * canonical completion was not established. A structural warning on an
 * established canonical ArtifactVersion is never a completion failure.
 * Without established completion the structural stamp keeps the failure on
 * the structural plane (never misattributed to provider runtime).
 */
export function isStructuralCompletionBlocked(metadata: Meta): boolean {
  if (!hasStructuralFailureStamp(metadata)) return false;
  return !isCanonicalCompletionEstablished(metadata);
}
