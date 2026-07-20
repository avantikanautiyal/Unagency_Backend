/** Branded experience identifiers. */

export type ExperienceId = string & { readonly __brand: "ExperienceId" };
export type ExperienceSnapshotId = string & { readonly __brand: "ExperienceSnapshotId" };
export type ExperienceReportId = string & { readonly __brand: "ExperienceReportId" };

export function asExperienceId(id: string): ExperienceId {
  return id as ExperienceId;
}

export function asExperienceSnapshotId(id: string): ExperienceSnapshotId {
  return id as ExperienceSnapshotId;
}

export function asExperienceReportId(id: string): ExperienceReportId {
  return id as ExperienceReportId;
}
