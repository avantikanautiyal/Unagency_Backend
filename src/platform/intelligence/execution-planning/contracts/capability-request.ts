/**
 * Capability request — inbound planning input.
 *
 * Purpose: Describe what capability to plan without choosing providers.
 * Responsibilities: Carry tenant scope and optional hints.
 * Usage: Passed to IExecutionPlanningEngine.produceExecutionPlan().
 * Future Extension: Streaming preferences, locale.
 */

import type {
  CapabilityId,
  OrganizationId,
  WorkspaceId,
} from "../../shared/identifiers";
import type { ExecutionPriority } from "./execution-priority";

export interface CapabilityRequest {
  readonly capabilityId: CapabilityId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly capabilityVersion?: string;
  readonly inputHints?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly priority?: ExecutionPriority;
}
