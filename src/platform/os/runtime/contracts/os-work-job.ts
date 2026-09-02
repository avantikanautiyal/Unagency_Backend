/**
 * Phase 8 — OS delivery work queue contracts.
 * Queue is transport. Durable OS state is authority.
 */

export const OS_DELIVERY_QUEUE = "os.delivery" as const;

export type OsWorkKind = "delivery";

export type OsWorkJobStatus =
  | "queued"
  | "claimed"
  | "completed"
  | "failed"
  | "dead_letter";

export interface OsWorkJob {
  readonly jobId: string;
  readonly kind: OsWorkKind;
  readonly organizationId: string;
  readonly executionId: string;
  readonly attempt?: number;
  readonly artifactId?: string;
  readonly artifactVersion?: number;
  readonly destination?: string;
  readonly deliveryIntent?: string;
  readonly status: OsWorkJobStatus;
  readonly claimedBy?: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly leaseExpiresAt?: string;
}

export interface IOsWorkQueue {
  enqueue(job: OsWorkJob): Promise<OsWorkJob>;
  tryClaim(
    jobId: string,
    workerId: string,
    leaseMs: number,
    nowIso: string
  ): Promise<OsWorkJob | undefined>;
  complete(jobId: string, nowIso: string): Promise<void>;
  fail(
    jobId: string,
    error: string,
    nowIso: string,
    deadLetter?: boolean
  ): Promise<OsWorkJob | undefined>;
  get(jobId: string): Promise<OsWorkJob | undefined>;
  listQueued(kind: OsWorkKind): Promise<readonly OsWorkJob[]>;
  reclaimExpired(nowIso: string, nowMs: number): Promise<readonly OsWorkJob[]>;
}

export function deliveryJobId(input: {
  readonly organizationId: string;
  readonly artifactId: string;
  readonly artifactVersion: number;
  readonly destination: string;
  readonly deliveryIntent?: string;
}): string {
  return [
    "dl",
    input.organizationId,
    input.artifactId,
    String(input.artifactVersion),
    input.destination,
    input.deliveryIntent ?? "default",
  ].join(":");
}
