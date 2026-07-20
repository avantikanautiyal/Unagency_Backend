/**
 * Provider certification badge.
 */

import type { CertificationBadgeId } from "./identifiers";
import type { CertificationStatus } from "./enums";

export interface ProviderCertificationBadge {
  readonly badgeId: CertificationBadgeId;
  readonly providerId: string;
  readonly vendor: string;
  readonly status: CertificationStatus;
  readonly overallScore: number;
  readonly certifiedAt: string;
  readonly expiresAt?: string;
  readonly version: string;
  readonly label: string;
}
