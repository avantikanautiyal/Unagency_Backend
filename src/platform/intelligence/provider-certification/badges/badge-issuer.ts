/**
 * Badge issuer — produces certification badge from report.
 */

import { asCertificationBadgeId } from "../contracts/identifiers";
import type { ProviderCertificationBadge } from "../contracts/badge";
import type { ProviderCertificationReport } from "../contracts/result";
import type { IBadgeIssuer } from "../interfaces/certification";
import { CERTIFICATION_VERSION } from "../constants";

const BADGE_LABELS: Record<string, string> = {
  certified: "UNAGENCY Certified Provider",
  certified_with_warnings: "UNAGENCY Certified (Warnings)",
  rejected: "Not Certified",
  experimental: "Experimental Provider",
  deprecated: "Deprecated Provider",
};

export class DefaultBadgeIssuer implements IBadgeIssuer {
  constructor(
    private readonly createId: (prefix: string) => string = (p) => `${p}_1`,
    private readonly nowIso: () => string = () => new Date().toISOString()
  ) {}

  issue(report: ProviderCertificationReport): ProviderCertificationBadge {
    return Object.freeze({
      badgeId: asCertificationBadgeId(this.createId("badge")),
      providerId: report.providerId,
      vendor: report.vendor,
      status: report.status,
      overallScore: report.scorecard.overallScore,
      certifiedAt: report.createdAt,
      version: CERTIFICATION_VERSION,
      label: BADGE_LABELS[report.status] ?? "Unknown",
    });
  }
}
