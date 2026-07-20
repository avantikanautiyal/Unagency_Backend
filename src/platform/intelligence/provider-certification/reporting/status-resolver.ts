/**
 * Resolve certification status from scorecard and suite results.
 */

import type { CertificationStatus } from "../contracts/enums";
import type { CertificationScorecard } from "../contracts/scorecard";
import type { SuiteResult } from "../contracts/suite-result";
import type { ProviderManifest } from "../../providers/adapters/contracts/provider-manifest";

export function resolveCertificationStatus(
  manifest: ProviderManifest,
  scorecard: CertificationScorecard,
  suiteResults: readonly SuiteResult[]
): CertificationStatus {
  if (manifest.maturity === "deprecated" || manifest.status === "retired") {
    return "deprecated";
  }
  if (manifest.maturity === "experimental") {
    return "experimental";
  }

  const hasFailures = suiteResults.some((s) => s.outcome === "fail");
  const hasWarnings = suiteResults.some((s) => s.outcome === "warn");

  if (hasFailures || !scorecard.passed) return "rejected";
  if (hasWarnings) return "certified_with_warnings";
  return "certified";
}
