/**
 * CDF phase-scoped create hints — keep server stamps from forcing full
 * Presentation/Website/Email/Document schemas when the phase contract does not
 * declare full product structured expand.
 *
 * Authority: phase.executionContract.structuredEmission + artifactType.
 * NEVER phase-ID Sets.
 */

import {
  resolveCdfPhaseExecutionContract,
  resolveProductStructuredStampPolicy,
} from "./canonical";

/**
 * @deprecated Phase-ID Sets removed — retained empty for import compatibility
 * with historical test names. Do not add IDs.
 */
export const CDF_EARLY_TEXT_PHASE_IDS: ReadonlySet<string> = new Set();

/**
 * @deprecated Phase-ID Sets removed — retained empty for import compatibility.
 */
export const CDF_LATE_STRUCTURED_PHASE_IDS: ReadonlySet<string> = new Set();

/**
 * True when create prepass / direct stamps must not force structured
 * PresentationRouteConcepts / WebsiteRoutes / EmailPlan / DocumentPlan.
 *
 * Canonical CDF emission schemas are stamped separately by
 * stampCanonicalStructuredOutputMetadata and are never suppressed by this flag.
 *
 * Contract authority:
 *   structuredEmission === 'none' → omit product stamps
 *   structuredEmission !== 'none' → follow resolveProductStructuredStampPolicy
 *
 * `cdfOmitStructuredOutput=true` is a transport/UI compatibility hint that may
 * omit *product* schemas only. When the phase requires structured emission,
 * stampCanonical still applies the declared contract schema (fail-closed).
 */
export function shouldOmitCdfStructuredStamp(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;

  const serviceId =
    typeof metadata.cdfServiceId === "string"
      ? metadata.cdfServiceId
      : typeof metadata.service === "string"
        ? metadata.service
        : null;
  const phaseId =
    typeof metadata.cdfPhaseId === "string" ? metadata.cdfPhaseId : null;

  const contract =
    serviceId && phaseId
      ? resolveCdfPhaseExecutionContract({ serviceId, phaseId })
      : undefined;

  if (contract) {
    const policy = resolveProductStructuredStampPolicy(contract);
    // UI flag can only reinforce product omit — never force product stamps
    // when the contract says omit, and never suppress canonical emission.
    if (policy.omitProductStructuredStamp) return true;
    if (metadata.cdfOmitStructuredOutput === true) {
      // Full-product-expand phases: UI omit is ignored for product stamps
      // when contract requires full expand — but still allow explicit lazy.
      const expand =
        typeof metadata.presentationExpandMode === "string"
          ? metadata.presentationExpandMode.trim().toLowerCase()
          : "";
      if (expand === "lazy") return true;
      // Contract says full expand and no lazy override → do not omit.
      return false;
    }
    return false;
  }

  // No resolvable contract — transport flag / expand / generator heuristics only.
  if (metadata.cdfOmitStructuredOutput === true) return true;

  const expand =
    typeof metadata.presentationExpandMode === "string"
      ? metadata.presentationExpandMode.trim().toLowerCase()
      : "";
  if (expand === "lazy") return true;

  const generator =
    typeof metadata.cdfGenerator === "string"
      ? metadata.cdfGenerator.trim().toLowerCase()
      : "";
  return generator === "text";
}
