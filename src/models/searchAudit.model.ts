import mongoose, { Schema, Document } from "mongoose";

/**
 * M10.17 — Global search audit log (observability, not user-facing).
 */
export interface ISearchAudit extends Document {
  userId?: string;
  organizationId?: string;
  brandId?: string;
  query: string;
  latencyMs: number;
  resultCount: number;
  createdAt: Date;
}

const SearchAuditSchema = new Schema<ISearchAudit>(
  {
    userId: { type: String, index: true },
    organizationId: { type: String, index: true },
    brandId: { type: String },
    query: { type: String, required: true },
    latencyMs: { type: Number, required: true },
    resultCount: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "search_audit" }
);

const SearchAudit = mongoose.model<ISearchAudit>(
  "SearchAudit",
  SearchAuditSchema
);
export default SearchAudit;
