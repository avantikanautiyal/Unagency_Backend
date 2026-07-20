/**
 * Coordination and communication contracts.
 */

import type { AgentId } from "./identifiers";
import type { CoordinationStrategyKind, ArtifactExchangeKind } from "./enums";

export interface CoordinationPlan {
  readonly planId: string;
  readonly primaryStrategy: CoordinationStrategyKind;
  readonly secondaryStrategies: readonly CoordinationStrategyKind[];
  readonly supervisorAgentId?: AgentId;
  readonly coordinatorAgentId?: AgentId;
  readonly rationale: string;
}

export interface CommunicationRule {
  readonly fromRole: string;
  readonly toRole: string;
  readonly artifactKinds: readonly ArtifactExchangeKind[];
  readonly bidirectional: boolean;
}

export interface CommunicationPlan {
  readonly planId: string;
  readonly matrix: readonly CommunicationRule[];
  readonly artifactOnly: boolean;
  readonly rationale: string;
}
