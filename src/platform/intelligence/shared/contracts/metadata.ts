/**
 * Base metadata contracts.
 * Every future intelligence object must extend BaseMetadata.
 */

import type {
  OrganizationId,
  UserId,
  WorkspaceId,
} from "../identifiers/branded";
import type { EntityStatus } from "../enums/status";

export interface BaseMetadata {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly createdBy: UserId;
  readonly updatedBy: UserId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: string;
  readonly status: EntityStatus;
}

export interface ExecutionMetricsMetadata {
  readonly cost?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly latencyMs?: number;
  readonly qualityScore?: number;
  readonly confidenceScore?: number;
}
