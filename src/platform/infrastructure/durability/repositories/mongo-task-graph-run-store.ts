/**
 * Mongo TaskGraphRunStore — optimistic CAS on stateVersion.
 */

import { Schema, model, type Document } from "mongoose";
import type { TaskGraphRunSnapshot } from "../../../os/task-graph-executor/contracts/task-graph-state";
import type { ITaskGraphRunStore } from "../../../os/task-graph-executor/persistence/task-graph-run-store";
import { TaskGraphExecutorError } from "../../../os/task-graph-executor/contracts/errors";

interface TaskGraphRunDoc extends Document {
  executionId: string;
  organizationId: string;
  stateVersion: number;
  snapshot: TaskGraphRunSnapshot;
  updatedAt: string;
}

const schema = new Schema<TaskGraphRunDoc>(
  {
    executionId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    stateVersion: { type: Number, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "enterprise_task_graph_runs" }
);

schema.index({ executionId: 1, organizationId: 1 }, { unique: true });

export const EnterpriseTaskGraphRun = model<TaskGraphRunDoc>(
  "EnterpriseTaskGraphRun",
  schema
);

export class MongoTaskGraphRunStore implements ITaskGraphRunStore {
  async get(
    executionId: string,
    organizationId: string
  ): Promise<TaskGraphRunSnapshot | undefined> {
    const doc = await EnterpriseTaskGraphRun.findOne({
      executionId,
      organizationId,
    }).lean();
    if (!doc) return undefined;
    const snap = doc.snapshot as TaskGraphRunSnapshot;
    if (snap.organizationId !== organizationId) {
      throw new TaskGraphExecutorError(
        "TENANT_VIOLATION",
        "Task graph run organization mismatch"
      );
    }
    return snap;
  }

  async compareAndSet(
    snapshot: TaskGraphRunSnapshot,
    expectedStateVersion: number | undefined
  ): Promise<boolean> {
    if (expectedStateVersion === undefined) {
      try {
        await EnterpriseTaskGraphRun.create({
          executionId: snapshot.executionId,
          organizationId: snapshot.organizationId,
          stateVersion: snapshot.stateVersion,
          snapshot,
          updatedAt: snapshot.updatedAt,
        });
        return true;
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === 11000) return false;
        throw err;
      }
    }
    const updated = await EnterpriseTaskGraphRun.findOneAndUpdate(
      {
        executionId: snapshot.executionId,
        organizationId: snapshot.organizationId,
        stateVersion: expectedStateVersion,
      },
      {
        $set: {
          stateVersion: snapshot.stateVersion,
          snapshot,
          updatedAt: snapshot.updatedAt,
        },
      },
      { new: true }
    ).lean();
    return Boolean(updated);
  }
}
