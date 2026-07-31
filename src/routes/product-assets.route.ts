import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  attachProductAssetToBrief,
  attachProductAssetToProject,
  deleteProductAsset,
  getProductAsset,
  getProductAssetMedia,
  listProductAssets,
  productAssetUpload,
  uploadProductAsset,
} from "../controllers/product-assets.controller";

const router = Router();

router.get("/", VerifyRole(["customer"]), listProductAssets);
router.post(
  "/upload",
  VerifyRole(["customer"]),
  productAssetUpload.single("file"),
  uploadProductAsset
);
router.get("/:assetId", VerifyRole(["customer"]), getProductAsset);
router.get("/:assetId/media", VerifyRole(["customer"]), getProductAssetMedia);
router.delete("/:assetId", VerifyRole(["customer"]), deleteProductAsset);
router.post(
  "/:assetId/attach-brief",
  VerifyRole(["customer"]),
  attachProductAssetToBrief
);
router.post(
  "/:assetId/attach-project",
  VerifyRole(["customer"]),
  attachProductAssetToProject
);

export default router;
