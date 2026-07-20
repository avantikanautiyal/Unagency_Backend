/**
 * Experience Intelligence request.
 */

import type { OrganizationId, WorkspaceId } from "../../shared/identifiers";
import type { ExperienceIntelligenceInputs } from "./inputs";

export interface ExperienceIntelligenceRequest {
  readonly requestId: string;
  readonly inputs: ExperienceIntelligenceInputs;
  readonly organizationId?: OrganizationId;
  readonly workspaceId?: WorkspaceId;
  readonly batchSize?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
