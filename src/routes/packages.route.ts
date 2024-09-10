import { Router } from "express";
import {
  CreatePackage,
  DeletePackage,
  fetchPackage,
  fetchPackageById,
  UpdatePackage,
} from "../controllers/packages.controller";

const router = Router();
router.post("/update/:id", UpdatePackage);
router.post("/delete/:id", DeletePackage);
router.get("/:id", fetchPackageById);
router.post("/", CreatePackage);
router.get("/", fetchPackage);

export default router;
