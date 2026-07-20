/**
 * Review hierarchy contracts.
 */

import type { AgentId } from "./identifiers";
import type { ReviewAuthorityLevel } from "./enums";

export interface ReviewLevel {
  readonly level: number;
  readonly role: string;
  readonly agentId: AgentId;
  readonly authority: ReviewAuthorityLevel;
  readonly reviewsRoles: readonly string[];
  readonly isHumanGate: boolean;
}

export interface ReviewHierarchy {
  readonly hierarchyId: string;
  readonly levels: readonly ReviewLevel[];
  readonly finalHumanApproval: boolean;
  readonly rationale: string;
}
