import mongoose, { Schema, Document } from "mongoose";

/**
 * M10.17 — Recent global search queries per user (Global Search feature).
 */
export interface ISearchRecent extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
  query: string;
  createdAt: Date;
}

const SearchRecentSchema = new Schema<ISearchRecent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Users",
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organizations",
      index: true,
    },
    query: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "search_recent" }
);

SearchRecentSchema.index({ userId: 1, createdAt: -1 });

const SearchRecent = mongoose.model<ISearchRecent>(
  "SearchRecent",
  SearchRecentSchema
);
export default SearchRecent;
