/**
 * Async media execution boundary — adapter for the direct provider spine.
 * Physical sync vs async may differ; logical lifecycle should share governance later.
 */

import type { OsLifecycleState } from "../lifecycle/states";
import type { OsLayerImplementationStatus } from "../contracts/layer-status";

export type AsyncExecutionLane =
  | "sync_direct_provider"
  | "async_media_coordinator";

export interface CanonicalAsyncExecutionEnvelope {
  readonly executionId: string;
  readonly organizationId: string;
  readonly requestId: string;
  readonly capabilityId: string;
  readonly lane: AsyncExecutionLane;
  readonly lifecycle: OsLifecycleState;
  /** Async lane does not yet run full post-gen governance on create. */
  readonly governanceAttached: boolean;
  readonly notes: string;
}

export interface IAsyncExecutionBoundary {
  readonly implementationStatus: OsLayerImplementationStatus;
  /**
   * Wrap an async media submission so it remains visible on the canonical spine.
   * Records the bypass honestly — does not claim full governance.
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
        "Async media is a coordinated leaf on the direct provider spine; full post-gen governance is not yet attached on this lane.",
    };
  }
}

export const defaultAsyncExecutionBoundary = new AsyncExecutionBoundary();
