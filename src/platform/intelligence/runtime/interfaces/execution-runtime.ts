/**
 * Execution Runtime ports.
 * Architecture only — no implementation.
 *
 * Runtime owns execution state and pipeline shape.
 * Runtime must NOT know concrete providers.
 */

import type {
  ExecutionId,
  OrganizationId,
  WorkspaceId,
} from "../../shared/identifiers";

export interface IExecutionContext {
  readonly executionId: ExecutionId;
  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly correlationId?: string;
}

export interface IExecutionScope {
  readonly context: IExecutionContext;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface IExecutionState {
  readonly status:
    | "pending"
    | "planning"
    | "running"
    | "awaiting_review"
    | "completed"
    | "failed"
    | "cancelled";
  readonly step?: string;
}

export interface IExecutionSession {
  readonly sessionId: string;
  readonly scope: IExecutionScope;
  readonly state: IExecutionState;
}

export interface IExecutionPipeline {
  readonly name: string;
  readonly stages: readonly string[];
}

export interface IRuntimeCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IExecutionRuntime {
  createSession(scope: IExecutionScope): Promise<IExecutionSession>;
  getSession(sessionId: string): Promise<IExecutionSession | undefined>;
}
