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
  // if (!validateTags(tags)) {
  //   return new ApiResponse(400, null, "Invalid Tags");
  // }
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
  return new ApiResponse(200, category, "Category created");
});

const fetchCategories = asyncHandler(async (req: Request, res: Response) => {
  const { tagline } = req.query;

  let filter: any = {};
  if (tagline && tagline !== "") {
    filter.tagline = tagline;
  }

  const categories = await Categories.find(filter);
  return new ApiResponse(200, categories, "Categories Fetched");
});

const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;

  const category = await Categories.findById(categoryId);

  if (!category) {
    return new ApiResponse(404, null, "Category not found");
  }

  // Extract the key from the featuredImage URL
  const key = category.featuredImage.split('/').pop();

  // Delete the image from S3
  const deleteParam = {
    Bucket: "prakriadirect",
    Key: key,
  };
  await deleteS3File(deleteParam);

  // Delete the category from database
  await Categories.findByIdAndDelete(categoryId);

  return new ApiResponse(200, null, "Category deleted successfully");
});


const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  const { title, tags, customPath } = req.body;
  const file = req.file as Express.MulterS3.File | undefined;

  const category = await Categories.findById(categoryId);

  if (!category) {
    return new ApiResponse(404, null, "Category not found");
  }

  let updatedData: any = { ...req.body };

  if (file && file.location) {
    // Delete old image if it exists
    if (category.featuredImage) {
      const key = category.featuredImage.split('/').pop();
      if (key) {
        await deleteS3File({
          Bucket: "prakriadirect",
          Key: key,
        });
      }
    }
    updatedData.featuredImage = file.location;
  }

  const updatedCategory = await Categories.findByIdAndUpdate(
    categoryId,
    updatedData,
    { new: true }
  );

  return new ApiResponse(200, updatedCategory, "Category updated successfully");
});

export { createCategory, fetchCategories, deleteCategory, updateCategory };
