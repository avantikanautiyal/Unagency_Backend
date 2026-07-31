import { Schema, model, type Document } from "mongoose";
import type { BrandBrainVersionRecord } from "../../../business/brand-brain/contracts";

export interface EnterpriseBrandVersionDoc extends Document {
  versionId: string;
  organizationId: string;
  version: number;
  label?: string;
  document: BrandBrainVersionRecord["document"];
  createdAt: string;
  createdBy?: string;
  changelog: string;
}

const enterpriseBrandVersionSchema = new Schema<EnterpriseBrandVersionDoc>(
  {
    versionId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    label: String,
    document: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: String, required: true },
    createdBy: String,
    changelog: { type: String, required: true },
  },
  { collection: "enterprise_brand_versions" }
);

enterpriseBrandVersionSchema.index(
  { organizationId: 1, version: 1 },
  { unique: true }
);

export const EnterpriseBrandVersion =
  model<EnterpriseBrandVersionDoc>(
    "EnterpriseBrandVersion",
    enterpriseBrandVersionSchema
  );
