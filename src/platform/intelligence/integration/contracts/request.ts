/**
 * Integration request — raw business request enters the OS pipeline.
 */

import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";
import type { IntegrationMode } from "./enums";

export interface IntelligenceOsIntegrationRequest {
  readonly requestId: string;
  readonly rawPrompt: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly scenarioHint?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly regionHint?: string;
  readonly mode?: IntegrationMode;
  readonly correlationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
