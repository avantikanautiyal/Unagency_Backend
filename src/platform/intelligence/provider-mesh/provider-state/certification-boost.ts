/**
 * Certification → score boost mapping (local to mesh; no certification mutation).
 */

import type { CertificationStatus } from "../../provider-certification/contracts/enums";

export function certificationBoost(status: CertificationStatus | undefined): number {
  switch (status) {
    case "certified":
      return 1;
    case "certified_with_warnings":
      return 0.8;
    case "experimental":
      return 0.55;
    case "deprecated":
      return 0.3;
    case "rejected":
      return 0.1;
    default:
      return 0.5;
  }
}

export function resolveCertificationStatus(
  events: readonly { readonly certificationStatus?: CertificationStatus }[]
): CertificationStatus | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.certificationStatus) return events[i]!.certificationStatus;
  }
  return undefined;
}
