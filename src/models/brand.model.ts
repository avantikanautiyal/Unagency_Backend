import mongoose, { Schema, Document } from "mongoose";

/**
 * Product Brand SoT (M10.12) — Legacy Mongo.
 * Tenant-isolated by organizationId. Brand Brain enrichment is separate.
 */

export type BrandStatus = "active" | "archived";

/**
 * M10.17 — Brand Guidelines deep profile. Stored as Mongo Mixed under
 * `guidelinesProfile`. Every field is optional: the UI only ever writes
 * what the user actually filled in (no fabricated/mock business data).
 */
export interface IBrandGuidelinesProfile {
  mission?: string;
  vision?: string;
  description?: string;
  brandStory?: string;
  targetAudience?: string;
  competitors?: string[];
  brandPersonality?: string;
  tone?: string;
  writingStyle?: string;
  preferredVocabulary?: string[];
  wordsToAvoid?: string[];
  primaryColors?: string[];
  secondaryColors?: string[];
  typography?: string;
  logoRules?: string;
  spacingRules?: string;
  photographyStyle?: string;
  illustrationStyle?: string;
  iconStyle?: string;
  socialStyle?: string;
  ctaStyle?: string;
  formattingRules?: string;
  emojiPolicy?: string;
  localizationRules?: string;
  aiRules?: string;
  approvalRules?: string;
  voiceGuidelines?: string;
  legalNotes?: string;
  complianceNotes?: string;
  [key: string]: unknown;
}

export interface IBrand extends Document {
  organizationId: mongoose.Types.ObjectId;
  ownerUserId: mongoose.Types.ObjectId;
  name: string;
  status: BrandStatus;
  logoAssetId?: mongoose.Types.ObjectId;
  colors: string[];
  voice?: string;
  positioning?: string;
  guidelines?: string;
  industry?: string;
  targetAudience?: string;
  website?: string;
  guidelinesProfile?: IBrandGuidelinesProfile;
  memberUserIds: mongoose.Types.ObjectId[];
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BrandSchema = new Schema<IBrand>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organizations",
      required: true,
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
      index: true,
    },
    logoAssetId: { type: Schema.Types.ObjectId, ref: "MediaFile" },
    colors: { type: [String], default: [] },
    voice: { type: String, default: "" },
    positioning: { type: String, default: "" },
    guidelines: { type: String, default: "" },
    industry: { type: String, default: "" },
    targetAudience: { type: String, default: "" },
    website: { type: String, default: "" },
    guidelinesProfile: { type: Schema.Types.Mixed, default: {} },
    memberUserIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Users" }],
      default: [],
    },
    archivedAt: { type: Date },
  },
  { collection: "brands", timestamps: true }
);

BrandSchema.index({ organizationId: 1, status: 1, name: 1 });
BrandSchema.index({ organizationId: 1, name: "text", voice: "text", positioning: "text" });

const Brands = mongoose.model<IBrand>("Brands", BrandSchema);
export default Brands;
