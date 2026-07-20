/**
 * Classification contracts.
 */

import type { DepartmentKind, DomainKind, TaskCategoryKind, TaskTypeKind } from "./enums";

export interface ClassificationScore {
  readonly label: string;
  readonly score: number;
  readonly confidence: number;
}

export interface DepartmentClassification {
  readonly primary: DepartmentKind;
  readonly secondary: readonly DepartmentKind[];
  readonly scores: readonly ClassificationScore[];
  readonly confidence: number;
  readonly rationale: string;
}

export interface DomainClassification {
  readonly primary: DomainKind;
  readonly scores: readonly ClassificationScore[];
  readonly confidence: number;
  readonly rationale: string;
}

export interface TaskClassification {
  readonly category: TaskCategoryKind;
  readonly taskType: TaskTypeKind;
  readonly confidence: number;
  readonly rationale: string;
}
