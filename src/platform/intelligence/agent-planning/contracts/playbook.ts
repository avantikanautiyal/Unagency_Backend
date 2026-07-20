/**
 * Team playbook contracts.
 */

import type { TeamPlaybookId } from "./identifiers";
import type { TeamPlaybookKind } from "./enums";

export interface TeamPlaybookRole {
  readonly role: string;
  readonly department: string;
  readonly responsibilities: readonly string[];
  readonly optional: boolean;
}

export interface TeamPlaybook {
  readonly playbookId: TeamPlaybookId;
  readonly name: string;
  readonly kind: TeamPlaybookKind;
  readonly version: string;
  readonly scenarioKeywords: readonly string[];
  readonly roles: readonly TeamPlaybookRole[];
  readonly coordinationStrategy: string;
  readonly description: string;
}
