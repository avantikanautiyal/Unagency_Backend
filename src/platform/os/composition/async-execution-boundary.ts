/**
 * Async media execution boundary — Phase 0 adapter.
 * Physical sync vs async may differ; logical lifecycle must eventually share governance.
 */

import type { OsLifecycleState } from "../lifecycle/states";
import type { OsLayerImplementationStatus } from "../contracts/layer-status";

export type AsyncExecutionLane = "sync_integration_pipeline" | "async_media_coordinator";

export interface CanonicalAsyncExecutionEnvelope {
  readonly executionId: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly capabilityId: string;
  readonly lane: AsyncExecutionLane;
  readonly lifecycle: OsLifecycleState;
  /** Phase 0: async lane does not yet run full IntegrationPipeline governance. */
  readonly governanceAttached: boolean;
  readonly notes: string;
}

export interface IAsyncExecutionBoundary {
  readonly implementationStatus: OsLayerImplementationStatus;
  /**
   * Wrap an async media submission so it remains visible on the canonical spine.
   * Phase 0 records the bypass honestly — does not claim full governance.
   */
  attachAsyncExecution(input: {
    readonly executionId: string;
    readonly organizationId: string;
    readonly requestId: string;
    readonly capabilityId: string;
  }): CanonicalAsyncExecutionEnvelope;
}

export class AsyncExecutionBoundary implements IAsyncExecutionBoundary {
  readonly implementationStatus: OsLayerImplementationStatus = "partial";

  attachAsyncExecution(input: {
    readonly executionId: string;
    readonly organizationId: string;
    readonly requestId: string;
    readonly capabilityId: string;
  }): CanonicalAsyncExecutionEnvelope {
    return {
      executionId: input.executionId,
      organizationId: input.organizationId,
      requestId: input.requestId,
      capabilityId: input.capabilityId,
      lane: "async_media_coordinator",
      lifecycle: "EXECUTING",
      governanceAttached: false,
      notes:
        "Phase 0: async media remains a coordinated leaf; full IntegrationPipeline governance not yet applied. Future phases must attach the same lifecycle/governance.",
    };
  }
}

export const defaultAsyncExecutionBoundary = new AsyncExecutionBoundary();
