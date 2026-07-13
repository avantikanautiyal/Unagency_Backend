/**
 * Gateway request/response contracts.
 *
 * Purpose: Public façade contracts for business modules.
 * Responsibilities: Capability invocation and execution control inputs/outputs.
 * Usage: Only types business modules should import from intelligence.
 * Future Extension: Streaming invocation options.
 */

import type {
  CapabilityId,
  OrganizationId,
  WorkspaceId,
} from "../../shared/identifiers";
import type { ExecutionPriority } from "../../execution-planning/contracts/execution-priority";
import type { ExecutionState } from "../../execution-runtime/contracts/execution-state";
import type { ExecutionMetrics } from "../../execution-runtime/contracts/execution-metrics";
import type { HealthStatus } from "../../shared/enums";

export interface GatewayCapabilityRequest {
  readonly capabilityId: CapabilityId | string;
  readonly organizationId: OrganizationId | string;
  readonly workspaceId: WorkspaceId | string;
  readonly capabilityVersion?: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly priority?: ExecutionPriority;
}

export interface GatewayCapabilityResponse {
  readonly sessionId: string;
  readonly planId: string;
  readonly orchestrationId?: string;
  readonly capabilityId: string;
  readonly state: ExecutionState;
  readonly output: Readonly<Record<string, unknown>>;
  readonly success: boolean;
  readonly message?: string;
}

export interface GatewayExecutionStatus {
  readonly sessionId: string;
  readonly state: ExecutionState;
  readonly metrics: ExecutionMetrics;
  readonly currentNodeId?: string;
}

export interface GatewayHealthComponent {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message?: string;
}

export interface GatewayHealthReport {
  readonly status: HealthStatus;
  readonly components: readonly GatewayHealthComponent[];
  readonly checkedAt: string;
}

export interface GatewayValidateCapabilityRequest {
  readonly capabilityId: CapabilityId | string;
  readonly capabilityVersion?: string;
}
