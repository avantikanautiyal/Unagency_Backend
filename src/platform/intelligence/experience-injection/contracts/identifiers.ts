/** Branded experience-injection identifiers. */

export type ExperienceInjectionResultId = string & {
  readonly __brand: "ExperienceInjectionResultId";
};
export type ExecutionExperiencePackageId = string & {
  readonly __brand: "ExecutionExperiencePackageId";
};

export function asExperienceInjectionResultId(id: string): ExperienceInjectionResultId {
  return id as ExperienceInjectionResultId;
}

export function asExecutionExperiencePackageId(id: string): ExecutionExperiencePackageId {
  return id as ExecutionExperiencePackageId;
}
