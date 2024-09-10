import Packages from "../models/packages.model";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { Request, Response } from "express";
import createStripeProduct from "../services/createStripeProduct";

const CreatePackage = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    description,
    price,
    duration,
    billingCycle,
    features,
    currency,
  } = req.body;
  if (
    !title ||
    !description ||
    !price ||
    !duration ||
    !billingCycle ||
    !features ||
    !currency
  ) {
    return new ApiResponse(400, null, "All fields are required");
  }
  const existingPackage = await Packages.exists({ title });
  if (existingPackage) {
    return new ApiResponse(
      409,
      null,
      "Package with the same title already exists"
    );
  }

  const stripeProductId = await createStripeProduct({ ...req.body });
  const createPackage = await Packages.create({
    ...req.body,
    stripe_product_id: stripeProductId,
  });
  if (createPackage) {
    return new ApiResponse(200, createPackage, "Package created");
  }
});
const fetchPackage = asyncHandler(async (req: Request, res: Response) => {
  const packages = await Packages.find({});
  if (packages) {
    return new ApiResponse(200, packages, "Packages are Fecthed");
  }
});
const fetchPackageById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const packageById = await Packages.findById(id);
  if (packageById) {
    return new ApiResponse(200, packageById, "Package is Fetched");
  }
});
const UpdatePackage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    title,
    description,
    price,
    duration,
    billingCycle,
    features,
    status,
    currency,
  } = req.body;

  const packagebyId = await Packages.findById(id);

  if (!packagebyId) {
    return new ApiResponse(404, null, "Package not fund");
  }

  packagebyId.title = title || packagebyId.title;
  packagebyId.description = description || packagebyId.description;
  packagebyId.price = price || packagebyId.price;
  packagebyId.duration = duration || packagebyId.duration;
  packagebyId.billingCycle = billingCycle || packagebyId.billingCycle;
  packagebyId.features = features || packagebyId.features;
  packagebyId.currency = currency || packagebyId.currency;
  packagebyId.status = status || packagebyId.status;

  const updatedPackage = await packagebyId.save();
  if (updatedPackage) {
    return new ApiResponse(200, updatedPackage, "Package updated successfully");
  }
});
const DeletePackage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const PackageById = await Packages.findById(id);
  if (!PackageById) {
    return res.status(404).json({ message: "Package not found" });
  }
  const deletePackage = await PackageById.deleteOne();
  if (deletePackage) {
    return new ApiResponse(200, null, "Package deleted successfully");
  }
});
export {
  CreatePackage,
  fetchPackage,
  fetchPackageById,
  UpdatePackage,
  DeletePackage,
};
