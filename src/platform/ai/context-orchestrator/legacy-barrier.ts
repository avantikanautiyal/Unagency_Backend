/**
 * Phase 10 — Legacy semantic prompt mutation barrier for canonical path.
 * When CMR was assembled by the Context Orchestrator, legacy post-CMR
 * prompt rebuild/append must not become the semantic source of truth.
 */

import { CDF_CANONICAL_CONTEXT_META } from "../../cdf/generation-context/flag";

/**
 * True when canonical CDF generation assembled CMR and legacy Spec/output/
 * presentation prompt rebuilds must not override semantic context.
 */
export function shouldSkipLegacySemanticPromptMutation(
  metadata: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!metadata) return false;
  if (metadata[CDF_CANONICAL_CONTEXT_META.applied] === true) return true;
  if (metadata[CDF_CANONICAL_CONTEXT_META.assemblyComplete] === true) {
    return true;
  }
  if (metadata[CDF_CANONICAL_CONTEXT_META.skipPostCmrAppends] === true) {
    return true;
  }
  if (metadata.cdfContextOrchestratorApplied === true) return true;
  return false;
}
