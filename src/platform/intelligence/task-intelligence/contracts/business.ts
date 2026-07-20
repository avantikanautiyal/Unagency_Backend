/**
 * Business objective contracts.
 */

import type { DomainKind } from "./enums";

export interface BusinessObjective {
  readonly objectiveId: string;
  readonly title: string;
  readonly description: string;
  readonly domain: DomainKind;
  readonly scenario: string;
  readonly successCriteria: readonly string[];
  readonly confidence: number;
}
