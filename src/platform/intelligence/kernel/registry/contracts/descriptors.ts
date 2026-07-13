/**
 * Registry descriptors for future intelligence components.
 * Placeholders only — no execution logic.
 */

import type {
  AgentId,
  CapabilityId,
  ModuleId,
  PluginId,
  ProviderId,
  WorkflowId,
} from "../../../shared/identifiers";
import type { EntityStatus } from "../../../shared/enums";

export interface ModuleDescriptor {
  readonly id: ModuleId;
  readonly name: string;
  readonly version: string;
  readonly status: EntityStatus;
  readonly dependencies?: readonly ModuleId[];
}

/**
 * Registration presence only.
 * Full planning metadata lives in `capability-catalog` (CapabilityDefinition).
 */
export interface CapabilityDescriptor {
  readonly id: CapabilityId;
  readonly name: string;
  readonly description: string;
  readonly status: EntityStatus;
  readonly version: string;
}

/**
 * Registration presence only.
 * Feature support lives in `provider-capability-matrix` (ProviderCapabilityProfile).
 */
export interface ProviderDescriptor {
  readonly id: ProviderId;
  readonly name: string;
  readonly status: EntityStatus;
  readonly version: string;
}

export interface WorkflowDescriptor {
  readonly id: WorkflowId;
  readonly name: string;
  readonly status: EntityStatus;
  readonly version: string;
}

export interface AgentDescriptor {
  readonly id: AgentId;
  readonly name: string;
  readonly status: EntityStatus;
  readonly version: string;
}

export interface PluginDescriptor {
  readonly id: PluginId;
  readonly name: string;
  readonly status: EntityStatus;
  readonly version: string;
}
