/**
 * Durable CDF session snapshots (Mongo).
 * In-memory store remains the hot path; this backs restarts / multi-instance.
 */

import { Schema, model, type Document, type Model } from "mongoose";
import type { CdfSessionState } from "../../../cdf/types";

export type CdfSessionDoc = Document & {
  sessionId: string;
  organizationId?: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  serviceId: string;
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
    snapshot: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "cdf_sessions" }
);

cdfSessionSchema.index({ organizationId: 1, updatedAt: -1 });

let CdfSessionModel: Model<CdfSessionDoc> | null = null;

function getModel(): Model<CdfSessionDoc> | null {
  try {
    if (!CdfSessionModel) {
      CdfSessionModel = model<CdfSessionDoc>("CdfSession", cdfSessionSchema);
    }
    return CdfSessionModel;
  } catch {
    // Model may already be registered
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mongoose = require("mongoose") as typeof import("mongoose");
      CdfSessionModel = mongoose.model<CdfSessionDoc>("CdfSession");
      return CdfSessionModel;
    } catch {
      return null;
    }
  }
}

function mongoReady(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mongoose = require("mongoose") as typeof import("mongoose");
    return mongoose.connection?.readyState === 1;
  } catch {
    return false;
  }
}

export async function persistCdfSessionToMongo(
  session: CdfSessionState
): Promise<void> {
  if (!mongoReady()) return;
  const Model = getModel();
  if (!Model) return;
  await Model.findOneAndUpdate(
    { sessionId: session.sessionId },
    {
      sessionId: session.sessionId,
      organizationId: session.organizationId,
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      userId: session.userId,
      serviceId: session.serviceId,
      snapshot: session,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
}

export async function loadCdfSessionFromMongo(
  sessionId: string
): Promise<CdfSessionState | undefined> {
  if (!mongoReady()) return undefined;
  const Model = getModel();
  if (!Model) return undefined;
  const doc = await Model.findOne({ sessionId }).lean().exec();
  if (!doc || !doc.snapshot || typeof doc.snapshot !== "object") {
    return undefined;
  }
  return doc.snapshot as CdfSessionState;
}
