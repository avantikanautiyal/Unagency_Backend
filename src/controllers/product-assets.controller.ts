import multer from "multer";
import { Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { productAssetService } from "../services/product-asset-service";

/** Memory multer — server remains authoritative; bytes go to IBlobStorage */
export const productAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // hard ceiling; finer limits by MIME in service
    files: 1,
  },
});

export const uploadProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const file = req.file;
    if (!file) throw new ApiError("file is required", 400);
    const organizationId =
      (req.body?.organizationId as string | undefined) ||
      orgIdFromUser(req);
    const dto = await productAssetService.upload({
      userId: String(req.user!.userId),
      organizationId,
      filename: file.originalname || "file",
      mimeType: file.mimetype,
      bytes: file.buffer,
      projectId: req.body?.projectId as string | undefined,
      briefId: req.body?.briefId as string | undefined,
      tag: (req.body?.tag as string | undefined) || "product_asset",
    });
    return new ApiResponse(200, dto, "Asset uploaded");
  }
);

function orgIdFromUser(req: RequestUser): string | undefined {
  const org = req.user?.organization as { _id?: { toString(): string } } | null;
  return org?._id?.toString();
}

export const listProductAssets = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const organizationId =
      (req.query.organizationId as string | undefined) || orgIdFromUser(req);
    const data = await productAssetService.list({
      userId: req.user!.userId!,
      organizationId,
    });
    return new ApiResponse(200, data, "Assets fetched");
  }
);

export const getProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.get({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Asset fetched");
  }
);

export const getProductAssetMedia = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.getMedia({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Media authorized");
  }
);

export const deleteProductAsset = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const data = await productAssetService.delete({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
    });
    return new ApiResponse(200, data, "Asset deleted");
  }
);

export const attachProductAssetToBrief = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { briefId } = req.body as { briefId?: string };
    if (!briefId) throw new ApiError("briefId is required", 400);
    const data = await productAssetService.attachToBrief({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      briefId,
    });
    return new ApiResponse(200, data, "Asset attached to brief");
  }
);

export const attachProductAssetToProject = asyncHandler(
  async (req: RequestUser, res: Response) => {
    const { projectId } = req.body as { projectId?: string };
    if (!projectId) throw new ApiError("projectId is required", 400);
    const data = await productAssetService.attachToProject({
      userId: req.user!.userId!,
      assetId: req.params.assetId,
      projectId,
    });
    return new ApiResponse(200, data, "Asset attached to project");
  }
);
