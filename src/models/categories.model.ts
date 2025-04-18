import mongoose, { Schema } from "mongoose";

export interface ICategories {
  _id: mongoose.Types.ObjectId;
  title: string;
  featuredImage: string;
  tags: object;
  tagline: string;
}

const CategorySchema = new Schema<ICategories>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    title: { type: String, required: true },
    featuredImage: { type: String, required: true },
    tags: { type: Array, required: true },
    tagline: { type: String, default: "" },
  },
  { collection: "categories", timestamps: true }
);

const Categories = mongoose.model<ICategories>("Categories", CategorySchema);
export default Categories;
