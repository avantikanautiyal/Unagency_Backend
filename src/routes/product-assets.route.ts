import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  abortMultipartUpload,
  attachProductAssetToBrief,
  attachProductAssetToProject,
  completeMultipartUpload,
  deleteProductAsset,
  getMultipartPartUrl,
  getProductAsset,
  getProductAssetMedia,
  initiateMultipartUpload,
  listProductAssets,
  productAssetUpload,
  restoreProductAsset,
  updateProductAssetMeta,
  uploadMultipartPart,
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

/** M10.18 — multipart / resumable large uploads */
router.post(
  "/multipart/initiate",
  VerifyRole(["customer"]),
  initiateMultipartUpload
);
router.post(
  "/multipart/:uploadId/parts",
  VerifyRole(["customer"]),
  productAssetUpload.single("file"),
  uploadMultipartPart
);
router.get(
  "/multipart/:uploadId/parts/:partNumber/url",
  VerifyRole(["customer"]),
  getMultipartPartUrl
);
router.get(
  "/multipart/:uploadId/part-url",
  VerifyRole(["customer"]),
  getMultipartPartUrl
);
router.post(
  "/multipart/:uploadId/complete",
  VerifyRole(["customer"]),
  completeMultipartUpload
);
router.delete(
  "/multipart/:uploadId",
  VerifyRole(["customer"]),
  abortMultipartUpload
);

router.get("/:assetId", VerifyRole(["customer"]), getProductAsset);
router.patch("/:assetId", VerifyRole(["customer"]), updateProductAssetMeta);
router.get("/:assetId/media", VerifyRole(["customer"]), getProductAssetMedia);
router.delete("/:assetId", VerifyRole(["customer"]), deleteProductAsset);
router.post(
  "/:assetId/restore",
  VerifyRole(["customer"]),
  restoreProductAsset
);
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
