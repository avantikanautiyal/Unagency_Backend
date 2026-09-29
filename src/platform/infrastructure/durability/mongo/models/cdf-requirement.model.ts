/**
 * Mongo durability for CDF Requirement Engine bags (M2).
 * Follows cdf-session.model Mixed-snapshot pattern — not a second DB system.
 */

import { Schema, model, type Document, type Model } from "mongoose";
import type {
  CdfActiveBrief,
  CdfRequirement,
  CdfSourceInput,
} from "../../../../cdf/requirements/types";

export type CdfRequirementSessionBag = {
  sources: CdfSourceInput[];
  requirements: CdfRequirement[];
  briefs: CdfActiveBrief[];
  activeBriefId?: string;
};

export type CdfRequirementDoc = Document & {
  sessionId: string;
  sources: CdfSourceInput[];
  requirements: CdfRequirement[];
  briefs: CdfActiveBrief[];
  activeBriefId?: string;
  updatedAt: string;
};

const schema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    sources: { type: Schema.Types.Mixed, required: true, default: [] },
    requirements: { type: Schema.Types.Mixed, required: true, default: [] },
    briefs: { type: Schema.Types.Mixed, required: true, default: [] },
    activeBriefId: { type: String },
    updatedAt: { type: String, required: true },
  },
  { collection: "cdf_requirement_bags" },
);

let ReqModel: Model<CdfRequirementDoc> | null = null;

function getModel(): Model<CdfRequirementDoc> | null {
  try {
    if (!ReqModel) {
      ReqModel = model<CdfRequirementDoc>("CdfRequirementBag", schema);
    }
    return ReqModel;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mongoose = require("mongoose") as typeof import("mongoose");
      ReqModel = mongoose.model<CdfRequirementDoc>("CdfRequirementBag");
      return ReqModel;
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

export async function persistCdfRequirementBagToMongo(
  sessionId: string,
  bag: CdfRequirementSessionBag,
): Promise<void> {
  if (!mongoReady()) return;
  const Model = getModel();
  if (!Model) return;
  const updatedAt = new Date().toISOString();
  await Model.findOneAndUpdate(
    { sessionId },
    {
      sessionId,
      sources: bag.sources,
      requirements: bag.requirements,
      briefs: bag.briefs,
      activeBriefId: bag.activeBriefId,
      updatedAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();
}

export async function loadCdfRequirementBagFromMongo(
  sessionId: string,
): Promise<CdfRequirementSessionBag | null> {
  if (!mongoReady()) return null;
  const Model = getModel();
  if (!Model) return null;
  const doc = await Model.findOne({ sessionId }).lean().exec();
  if (!doc) return null;
  return {
    sources: (doc.sources as CdfSourceInput[]) ?? [],
    requirements: (doc.requirements as CdfRequirement[]) ?? [],
    briefs: (doc.briefs as CdfActiveBrief[]) ?? [],
    activeBriefId: doc.activeBriefId,
  };
}
