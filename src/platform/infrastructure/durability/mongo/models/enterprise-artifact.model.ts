import { Schema, model, type Document } from "mongoose";

export interface EnterpriseArtifactDoc extends Document {
  artifactId: string;
  executionId: string;
  organizationId: string;
  kind: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

const enterpriseArtifactSchema = new Schema<EnterpriseArtifactDoc>(
  {
    artifactId: { type: String, required: true, unique: true, index: true },
    executionId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    label: { type: String, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "enterprise_artifacts" }
);

enterpriseArtifactSchema.index({ executionId: 1, artifactId: 1 });

export const EnterpriseArtifact = model<EnterpriseArtifactDoc>(
  "EnterpriseArtifact",
  enterpriseArtifactSchema
);
