/**
 * Task Intelligence request contract.
 */

import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";
import type { PlaybookId } from "./identifiers";

export interface TaskIntelligenceRequest {
  readonly requestId: string;
  readonly rawPrompt: string;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly playbookId?: PlaybookId;
  readonly industryHint?: string;
  readonly departmentHint?: string;
  readonly budgetHint?: number;
  readonly latencyHintMs?: number;
  readonly regionHint?: string;
  readonly contextNotes?: string;
}
