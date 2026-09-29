/**
 * Durable CDF session snapshots (Mongo) with optimistic concurrency (M1B).
 *
 * Hot path remains in-memory. When Mongo is connected, CAS updates use:
 *   WHERE sessionId = X AND sessionVersion = expectedVersion
 *
 * Import paths are relative to this file under
 * platform/infrastructure/durability/mongo/models → ../../../../cdf/...
 */

import mongoose, { Schema, model, type Document, type Model } from "mongoose";
import type { CdfSessionState } from "../../../../cdf/types";
import { normalizeCdfSession } from "../../../../cdf/state-machine/normalize";

export type CdfSessionDoc = Document & {
  sessionId: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  serviceId: string;
  sessionVersion: number;
  snapshot: CdfSessionState;
  createdAt: string;
  updatedAt: string;
};

const cdfSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, index: true },
    workspaceId: { type: String, index: true },
    projectId: { type: String, index: true },
    userId: { type: String, index: true },
    serviceId: { type: String, required: true, index: true },
    sessionVersion: { type: Number, required: true, default: 0, index: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "cdf_sessions" },
);

cdfSessionSchema.index({ organizationId: 1, updatedAt: -1 });
cdfSessionSchema.index({ sessionId: 1, sessionVersion: 1 });

let CdfSessionModel: Model<CdfSessionDoc> | null = null;

function getModel(): Model<CdfSessionDoc> | null {
  try {
    if (!CdfSessionModel) {
      CdfSessionModel = model<CdfSessionDoc>("CdfSession", cdfSessionSchema);
    }
    return CdfSessionModel;
  } catch {
    try {
      CdfSessionModel = mongoose.model<CdfSessionDoc>("CdfSession");
      return CdfSessionModel;
    } catch {
      return null;
    }
  }
}

export function isCdfSessionMongoReady(): boolean {
  return mongoose.connection?.readyState === 1;
}

export type CdfSessionMongoWriteResult =
  | { readonly ok: true; readonly mode: "upsert" | "cas" }
  | {
      readonly ok: false;
      readonly reason:
        | "mongo_unavailable"
        | "model_unavailable"
        | "cas_conflict"
        | "write_failed";
      readonly message?: string;
    };

export async function persistCdfSessionToMongo(
  session: CdfSessionState,
): Promise<CdfSessionMongoWriteResult> {
  if (!isCdfSessionMongoReady()) {
    return { ok: false, reason: "mongo_unavailable" };
  }
  const Model = getModel();
  if (!Model) {
    return { ok: false, reason: "model_unavailable" };
  }
  const normalized = normalizeCdfSession(session);
  try {
    await Model.findOneAndUpdate(
      { sessionId: normalized.sessionId },
      {
        sessionId: normalized.sessionId,
        organizationId: normalized.organizationId,
        workspaceId: normalized.workspaceId,
        projectId: normalized.projectId,
        userId: normalized.userId,
        serviceId: normalized.serviceId,
        sessionVersion: normalized.sessionVersion,
        snapshot: normalized,
        createdAt: normalized.createdAt,
        updatedAt: normalized.updatedAt,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    return { ok: true, mode: "upsert" };
  } catch (err) {
    return {
      ok: false,
      reason: "write_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Atomic conditional update.
 * @returns ok:true if updated, ok:false cas_conflict if version mismatch/missing,
 *          mongo_unavailable / model_unavailable when store cannot be used.
 */
export async function persistCdfSessionCasToMongo(
  expectedVersion: number,
  session: CdfSessionState,
): Promise<CdfSessionMongoWriteResult> {
  if (!isCdfSessionMongoReady()) {
    return { ok: false, reason: "mongo_unavailable" };
  }
  const Model = getModel();
  if (!Model) {
    return { ok: false, reason: "model_unavailable" };
  }
  const normalized = normalizeCdfSession(session);
  try {
    const updated = await Model.findOneAndUpdate(
      {
        sessionId: normalized.sessionId,
        sessionVersion: expectedVersion,
      },
      {
        $set: {
          organizationId: normalized.organizationId,
          workspaceId: normalized.workspaceId,
          projectId: normalized.projectId,
          userId: normalized.userId,
          serviceId: normalized.serviceId,
          sessionVersion: normalized.sessionVersion,
          snapshot: normalized,
          updatedAt: normalized.updatedAt,
        },
        $setOnInsert: {
          sessionId: normalized.sessionId,
          createdAt: normalized.createdAt,
        },
      },
      { new: true },
    ).exec();
    if (!updated) {
      return { ok: false, reason: "cas_conflict" };
    }
    return { ok: true, mode: "cas" };
  } catch (err) {
    return {
      ok: false,
      reason: "write_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loadCdfSessionFromMongo(
  sessionId: string,
): Promise<CdfSessionState | undefined> {
  if (!isCdfSessionMongoReady()) return undefined;
  const Model = getModel();
  if (!Model) return undefined;
  const doc = await Model.findOne({ sessionId }).lean().exec();
  if (!doc || !doc.snapshot || typeof doc.snapshot !== "object") {
    return undefined;
  }
  const snapshot = doc.snapshot as CdfSessionState;
  if (
    typeof doc.sessionVersion === "number" &&
    snapshot.sessionVersion == null
  ) {
    snapshot.sessionVersion = doc.sessionVersion;
  }
  return normalizeCdfSession(snapshot);
}
