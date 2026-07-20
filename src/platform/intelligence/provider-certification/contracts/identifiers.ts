/** Branded certification identifiers. */

export type CertificationReportId = string & { readonly __brand: "CertificationReportId" };
export type CertificationBadgeId = string & { readonly __brand: "CertificationBadgeId" };
export type SuiteRunId = string & { readonly __brand: "SuiteRunId" };

export function asCertificationReportId(id: string): CertificationReportId {
  return id as CertificationReportId;
}

export function asCertificationBadgeId(id: string): CertificationBadgeId {
  return id as CertificationBadgeId;
}

export function asSuiteRunId(id: string): SuiteRunId {
  return id as SuiteRunId;
}
