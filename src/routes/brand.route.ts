import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  archiveBrand,
  createBrand,
  deleteBrand,
  getBrand,
  learnBrandFromBrief,
  listBrands,
  restoreBrand,
  updateBrand,
} from "../controllers/brand.controller";

const router = Router();

router.get("/", VerifyRole(["customer"]), listBrands);
router.post("/", VerifyRole(["customer"]), createBrand);
router.get("/:brandId", VerifyRole(["customer"]), getBrand);
router.post("/:brandId/learn-from-brief", VerifyRole(["customer"]), learnBrandFromBrief);
router.patch("/:brandId", VerifyRole(["customer"]), updateBrand);
router.post("/:brandId/archive", VerifyRole(["customer"]), archiveBrand);
router.post("/:brandId/restore", VerifyRole(["customer"]), restoreBrand);
router.delete("/:brandId", VerifyRole(["customer"]), deleteBrand);

export default router;
