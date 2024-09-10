import { Request, Response } from "express";
import Categories from "../models/categories.model";
import deleteS3File from "../services/deleteS3File";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const validateTags = (tags: any): boolean => {
  if (!Array.isArray(tags)) return false;
  return tags.every((tag) => typeof tag === "string");
};

const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const { title, tags, customPath } = req.body;
  const file = req.file as Express.MulterS3.File | undefined;

  if (!req.file || !file?.location) {
    return new ApiResponse(400, null, "Featured image is required");
  }
  const featuredImage = file?.location;
  if (!title || typeof title !== "string" || !title.trim()) {
    return new ApiResponse(400, null, "Invalid Title");
  }
  if (!customPath || typeof customPath !== "string" || !customPath.trim()) {
    return new ApiResponse(400, null, "Invalid Custom Path");
  }
  if (
    !featuredImage ||
    typeof featuredImage !== "string" ||
    !featuredImage.trim()
  ) {
    return new ApiResponse(400, null, "Invalid Featured Image");
  }
  if (!validateTags(tags)) {
    return new ApiResponse(400, null, "Invalid Tags");
  }
  const isExist = await Categories.exists({ title: req.body.title });
  if (isExist) {
    const deleteParam = {
      Bucket: "prakriadirect",
      Key: file?.key,
    };
    await deleteS3File(deleteParam);
    return new ApiResponse(
      409,
      null,
      "Category will the same title already exists"
    );
  }
  const category = await Categories.create({ title, featuredImage, tags });
  if (category) {
    return new ApiResponse(200, category, "Category created");
  }
});
const fetchCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Categories.find({});
  if (categories) {
    return new ApiResponse(200, categories, "Categories Fetched");
  }
});
export { createCategory, fetchCategories };
