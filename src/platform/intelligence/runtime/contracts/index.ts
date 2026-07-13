/**
 * Runtime contracts (architecture only).
 */

export interface ExecutionPipelineStageContract {
  readonly name: string;
  readonly order: number;
  readonly optional?: boolean;
}

export interface RuntimeCacheEntryContract {
  readonly key: string;
  readonly expiresAt?: string;
}
