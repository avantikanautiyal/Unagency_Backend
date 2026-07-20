/**
 * Control Plane request contract.
 */

import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";

export interface ControlPlaneRequest {
  readonly requestId: string;
  readonly rawPrompt: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly scenarioHint?: string;
  readonly budgetLimit?: number;
  readonly tokenBudgetLimit?: number;
  readonly regionHint?: string;
  readonly mode?: import("./enums").ControlPlaneMode;
}
