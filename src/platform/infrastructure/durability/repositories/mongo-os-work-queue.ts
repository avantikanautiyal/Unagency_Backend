/**
 * Mongo OS work queue — atomic claim via findOneAndUpdate.
 */

import { Schema, model, type Document } from "mongoose";
import type {
  IOsWorkQueue,
  OsWorkJob,
  OsWorkKind,
} from "../../../os/runtime/contracts/os-work-job";
import { logOsExecutionEvent } from "../../../os/observability/execution-log";

interface OsWorkJobDoc extends Document, OsWorkJob {}

const osWorkJobSchema = new Schema<OsWorkJobDoc>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    kind: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    executionId: { type: String, required: true, index: true },
    planVersion: Number,
    taskId: String,
    attempt: { type: Number, required: true },
    artifactId: String,
    artifactVersion: Number,
    destination: String,
    deliveryIntent: String,
    status: { type: String, required: true, index: true },
    claimedBy: String,
    attempts: { type: Number, required: true },
    maxAttempts: { type: Number, required: true },
    lastError: String,
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
    leaseExpiresAt: String,
  },
  { collection: "enterprise_os_work_jobs" }
);

export const EnterpriseOsWorkJob = model<OsWorkJobDoc>(
  "EnterpriseOsWorkJob",
  osWorkJobSchema
);

function toJob(doc: OsWorkJob): OsWorkJob {
  return {
    jobId: doc.jobId,
    kind: doc.kind,
    organizationId: doc.organizationId,
    executionId: doc.executionId,
    planVersion: doc.planVersion,
    taskId: doc.taskId,
    attempt: doc.attempt,
    artifactId: doc.artifactId,
    artifactVersion: doc.artifactVersion,
    destination: doc.destination,
    deliveryIntent: doc.deliveryIntent,
    status: doc.status,
    claimedBy: doc.claimedBy,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    lastError: doc.lastError,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    leaseExpiresAt: doc.leaseExpiresAt,
  };
}

export class MongoOsWorkQueue implements IOsWorkQueue {
  async enqueue(job: OsWorkJob): Promise<OsWorkJob> {
    const existing = await EnterpriseOsWorkJob.findOne({ jobId: job.jobId }).lean();
    if (existing) return toJob(existing as unknown as OsWorkJob);
    await EnterpriseOsWorkJob.updateOne(
      { jobId: job.jobId },
      { $setOnInsert: job },
      { upsert: true }
    );
    logOsExecutionEvent("queue.job.queued", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "queued",
      taskId: job.taskId,
    });
    return job;
  }

  async tryClaim(
    jobId: string,
    workerId: string,
    leaseMs: number,
    nowIso: string
  ): Promise<OsWorkJob | undefined> {
    const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
    const doc = await EnterpriseOsWorkJob.findOneAndUpdate(
      { jobId, status: { $in: ["queued", "failed"] } },
      {
        $set: {
          status: "claimed",
          claimedBy: workerId,
          updatedAt: nowIso,
          leaseExpiresAt,
        },
        $inc: { attempts: 1 },
      },
      { new: true }
    ).lean();
    if (!doc) return undefined;
    const job = toJob(doc as unknown as OsWorkJob);
    logOsExecutionEvent("queue.job.claimed", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "claimed",
      taskId: job.taskId,
    });
    return job;
  }

  async complete(jobId: string, nowIso: string): Promise<void> {
    const doc = await EnterpriseOsWorkJob.findOneAndUpdate(
      { jobId },
      { $set: { status: "completed", updatedAt: nowIso } },
      { new: true }
    ).lean();
    if (!doc) return;
    const job = toJob(doc as unknown as OsWorkJob);
    logOsExecutionEvent("queue.job.completed", {
      requestId: job.executionId,
      executionId: job.executionId,
      organizationId: job.organizationId,
      status: "completed",
      taskId: job.taskId,
    });
  }

  async fail(
    jobId: string,
    error: string,
    nowIso: string,
    deadLetter?: boolean
  ): Promise<OsWorkJob | undefined> {
    const current = await EnterpriseOsWorkJob.findOne({ jobId }).lean();
    if (!current) return undefined;
    const terminal =
      deadLetter || (current.attempts ?? 0) >= (current.maxAttempts ?? 3);
    const status = terminal ? "dead_letter" : "failed";
    const doc = await EnterpriseOsWorkJob.findOneAndUpdate(
      { jobId },
      { $set: { status, lastError: error, updatedAt: nowIso } },
      { new: true }
    ).lean();
    if (!doc) return undefined;
    return toJob(doc as unknown as OsWorkJob);
  }

  async get(jobId: string): Promise<OsWorkJob | undefined> {
    const doc = await EnterpriseOsWorkJob.findOne({ jobId }).lean();
    return doc ? toJob(doc as unknown as OsWorkJob) : undefined;
  }

  async listQueued(kind: OsWorkKind): Promise<readonly OsWorkJob[]> {
    const docs = await EnterpriseOsWorkJob.find({
      kind,
      status: { $in: ["queued", "failed"] },
    }).lean();
    return docs.map((d) => toJob(d as unknown as OsWorkJob));
  }

  async reclaimExpired(nowIso: string, nowMs: number): Promise<readonly OsWorkJob[]> {
    const nowLease = new Date(nowMs).toISOString();
    const docs = await EnterpriseOsWorkJob.find({
      status: "claimed",
      leaseExpiresAt: { $lte: nowLease },
    }).lean();
    const recovered: OsWorkJob[] = [];
    for (const doc of docs) {
      const updated = await EnterpriseOsWorkJob.findOneAndUpdate(
        {
          jobId: doc.jobId,
          status: "claimed",
          leaseExpiresAt: { $lte: nowLease },
        },
        {
          $set: {
            status: "queued",
            claimedBy: undefined,
            leaseExpiresAt: undefined,
            updatedAt: nowIso,
          },
        },
        { new: true }
      ).lean();
      if (updated) {
        recovered.push(toJob(updated as unknown as OsWorkJob));
        logOsExecutionEvent("queue.job.recovered", {
          requestId: doc.executionId,
          executionId: doc.executionId,
          organizationId: doc.organizationId,
          status: "queued",
          taskId: doc.taskId,
        });
      }
    }
    return recovered;
  }
}
