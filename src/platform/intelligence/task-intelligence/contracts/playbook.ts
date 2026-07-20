/**
 * Client playbook and workflow library contracts.
 */

import type { PlaybookId } from "./identifiers";
import type { PlaybookIndustry } from "./enums";

export interface PlaybookTaskTemplate {
  readonly templateId: string;
  readonly title: string;
  readonly description: string;
  readonly capabilityId: string;
  readonly dependsOn: readonly string[];
  readonly stage: number;
  readonly parallelGroup?: string;
  readonly requiresReview: boolean;
  readonly optional: boolean;
}

export interface ClientPlaybook {
  readonly playbookId: PlaybookId;
  readonly name: string;
  readonly version: string;
  readonly industry: PlaybookIndustry;
  readonly scenarioKeywords: readonly string[];
  readonly description: string;
  readonly tasks: readonly PlaybookTaskTemplate[];
  readonly deliverables: readonly string[];
  readonly organizationId?: string;
}
