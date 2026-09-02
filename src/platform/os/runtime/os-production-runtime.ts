/**
 * Production runtime — delivery queue workers only (task graph removed).
 */

import type { OsDeliveryService } from "../delivery/engine/delivery-service";
import {
  deliveryJobId,
  type IOsWorkQueue,
  type OsWorkJob,
} from "./contracts/os-work-job";
import { logOsExecutionEvent } from "../observability/execution-log";
import type { DeliveryReceipt } from "../delivery/contracts/delivery";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

export class OsProductionRuntime {
  readonly implementationStatus = "implemented" as const;
  private readonly leaseMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly deps: {
      readonly queue: IOsWorkQueue;
      readonly delivery: OsDeliveryService;
      readonly leaseMs?: number;
      readonly maxAttempts?: number;
      readonly nowIso?: () => string;
      readonly clockMs?: () => number;
    }
  ) {
    this.leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
    this.maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  get queue(): IOsWorkQueue {
    return this.deps.queue;
  }

  get delivery(): OsDeliveryService {
    return this.deps.delivery;
  }

  async enqueueDelivery(receipt: DeliveryReceipt): Promise<void> {
    const nowIso = this.deps.nowIso ?? (() => new Date().toISOString());
    const at = nowIso();
    const job: OsWorkJob = {
      jobId: deliveryJobId({
        organizationId: receipt.organizationId,
        artifactId: receipt.artifactId,
        artifactVersion: receipt.artifactVersion,
        destination: receipt.destination,
        deliveryIntent: receipt.idempotencyKey,
      }),
      kind: "delivery",
      organizationId: receipt.organizationId,
      executionId: receipt.executionId,
      artifactId: receipt.artifactId,
      artifactVersion: receipt.artifactVersion,
      destination: receipt.destination,
      deliveryIntent: receipt.idempotencyKey,
      attempt: 1,
      status: "queued",
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: at,
      updatedAt: at,
    };
    await this.deps.queue.enqueue(job);
  }

  async tickDeliveryWorker(workerId: string): Promise<OsWorkJob | undefined> {
    const nowIso = this.deps.nowIso ?? (() => new Date().toISOString());
    const clockMs = this.deps.clockMs ?? (() => Date.now());
    await this.deps.queue.reclaimExpired(nowIso(), clockMs());
    const queued = await this.deps.queue.listQueued("delivery");
    for (const job of queued) {
      const claimed = await this.deps.queue.tryClaim(
        job.jobId,
        workerId,
        this.leaseMs,
        nowIso()
      );
      if (!claimed) continue;
      try {
        const existing = await this.deps.delivery.getDelivery(
          claimed.deliveryIntent
            ? (
                await this.deps.delivery.getReceiptStore().getByIdempotencyKey(
                  claimed.deliveryIntent,
                  claimed.organizationId
                )
              )?.deliveryId ?? ""
            : "",
          claimed.organizationId
        );
        const byIdem = claimed.deliveryIntent
          ? await this.deps.delivery
              .getReceiptStore()
              .getByIdempotencyKey(claimed.deliveryIntent, claimed.organizationId)
          : undefined;
        const receipt = existing ?? byIdem;
        if (!receipt) {
          await this.deps.queue.fail(claimed.jobId, "DELIVERY_NOT_FOUND", nowIso(), true);
          return claimed;
        }
        if (receipt.status === "SUCCEEDED" || receipt.status === "CANCELLED") {
          await this.deps.queue.complete(claimed.jobId, nowIso());
          return claimed;
        }
        const processed = await this.deps.delivery.processQueuedDelivery(
          receipt.deliveryId,
          claimed.organizationId,
          nowIso
        );
        if (processed?.status === "SUCCEEDED") {
          await this.deps.queue.complete(claimed.jobId, nowIso());
        } else {
          await this.deps.queue.fail(
            claimed.jobId,
            processed?.failureReason ?? "delivery_failed",
            nowIso()
          );
        }
        return claimed;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "delivery_worker_error";
        await this.deps.queue.fail(claimed.jobId, msg, nowIso());
        return claimed;
      }
    }
    return undefined;
  }

  async reconcile(nowIso?: string, nowMs?: number): Promise<{ readonly reclaimedJobs: number }> {
    const at = nowIso ?? new Date().toISOString();
    const ms = nowMs ?? Date.now();
    const recovered = await this.deps.queue.reclaimExpired(at, ms);
    logOsExecutionEvent("queue.job.recovered", {
      requestId: "reconcile",
      executionId: "reconcile",
      organizationId: "system",
      status: String(recovered.length),
    });
    return { reclaimedJobs: recovered.length };
  }
}

export function createOsProductionRuntime(
  deps: ConstructorParameters<typeof OsProductionRuntime>[0]
): OsProductionRuntime {
  return new OsProductionRuntime(deps);
}
