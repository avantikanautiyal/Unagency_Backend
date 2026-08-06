import mongoose, { Schema, Document } from "mongoose";

/**
 * Help Centre CMS (M10.12) — articles persisted in Mongo.
 */

export interface IHelpArticle extends Document {
  category: string;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  published: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const HelpArticleSchema = new Schema<IHelpArticle>(
  {
    category: { type: String, required: true, index: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    body: { type: String, required: true },
    tags: { type: [String], default: [] },
    published: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { collection: "help_articles", timestamps: true }
);

HelpArticleSchema.index({ title: "text", body: "text", tags: "text" });

const HelpArticles = mongoose.model<IHelpArticle>(
  "HelpArticles",
  HelpArticleSchema
);
export default HelpArticles;
