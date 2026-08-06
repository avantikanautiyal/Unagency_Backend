import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { brandService } from "../services/brand-service";

function orgIdFromUser(req: RequestUser): string | undefined {
  const org = req.user?.organization as { _id?: { toString(): string } } | null;
  return org?._id?.toString();
}

export const listBrands = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.list({
    userId: req.user!.userId!,
    organizationId:
      (req.query.organizationId as string | undefined) || orgIdFromUser(req),
    status: (req.query.status as "active" | "archived" | "all" | undefined) ||
      "active",
    q: req.query.q as string | undefined,
  });
  return new ApiResponse(200, data, "Brands fetched");
});

export const createBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.create({
    userId: req.user!.userId!,
    organizationId:
      (req.body?.organizationId as string | undefined) || orgIdFromUser(req),
    name: req.body?.name,
    colors: req.body?.colors,
    voice: req.body?.voice,
    positioning: req.body?.positioning,
    guidelines: req.body?.guidelines,
    industry: req.body?.industry,
    targetAudience: req.body?.targetAudience,
    website: req.body?.website,
    logoAssetId: req.body?.logoAssetId,
    guidelinesProfile: req.body?.guidelinesProfile,
  });
  return new ApiResponse(201, data, "Brand created");
});

export const getBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.get({
    userId: req.user!.userId!,
    brandId: req.params.brandId,
  });
  return new ApiResponse(200, data, "Brand fetched");
});

export const updateBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.update({
    userId: req.user!.userId!,
    brandId: req.params.brandId,
    patch: req.body ?? {},
  });
  return new ApiResponse(200, data, "Brand updated");
});

export const archiveBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.archive({
    userId: req.user!.userId!,
    brandId: req.params.brandId,
  });
  return new ApiResponse(200, data, "Brand archived");
});

export const restoreBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.restore({
    userId: req.user!.userId!,
    brandId: req.params.brandId,
  });
  return new ApiResponse(200, data, "Brand restored");
});

export const deleteBrand = asyncHandler(async (req: RequestUser) => {
  const data = await brandService.remove({
    userId: req.user!.userId!,
    brandId: req.params.brandId,
  });
  return new ApiResponse(200, data, "Brand deleted");
});
