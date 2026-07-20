/**
 * Agent role profile contracts.
 */

import type { AgentId } from "./identifiers";
import type {
  AgentDepartment,
  ArtifactExchangeKind,
  ComplexityRange,
  ReviewAuthorityLevel,
} from "./enums";
import type { CapabilityId } from "../../shared/identifiers";

export interface AgentRoleProfile {
  readonly agentId: AgentId;
  readonly role: string;
  readonly department: AgentDepartment;
  readonly capabilities: readonly CapabilityId[];
  readonly supportedTaskTypes: readonly string[];
  readonly preferredDeliverables: readonly string[];
  readonly complexityRange: ComplexityRange;
  readonly parallelExecutionSupport: boolean;
  readonly reviewAuthority: ReviewAuthorityLevel;
  readonly dependencies: readonly string[];
  readonly communicationRules: readonly string[];
  readonly preferredModelCharacteristics: readonly string[];
}
