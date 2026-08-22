import { Schema, model, type Document } from "mongoose";
import type { Experience } from "../../../../intelligence/experience-intelligence/contracts/experience";

export interface EnterpriseExperienceDoc extends Document {
  readonly experienceId: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly experience: Experience;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const enterpriseExperienceSchema =
  new Schema<EnterpriseExperienceDoc>(
    {
      experienceId: { type: String, required: true, unique: true, index: true },
      organizationId: { type: String, index: true },
      workspaceId: { type: String, index: true },
      experience: { type: Schema.Types.Mixed, required: true },
      createdAt: { type: String, required: true },
      updatedAt: { type: String, required: true },
    },
    { collection: "enterprise_experiences" }
  );

// Helps scoped retrieval during debugging and future query optimizations.
enterpriseExperienceSchema.index({ organizationId: 1, workspaceId: 1 });

export const EnterpriseExperience =
  model<EnterpriseExperienceDoc>(
    "EnterpriseExperience",
    enterpriseExperienceSchema
  );

