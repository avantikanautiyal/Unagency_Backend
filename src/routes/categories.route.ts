import { Router } from "express";
import {
  createCategory,
  fetchCategories,
} from "../controllers/categories.controller";
import { fileUpload } from "../middlewares/multers3.middleware";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post(
  "/",
  VerifyRole(["admin", "superadmin"]),
  fileUpload.single("featuredImage"),
  createCategory
);
router.get("/", fetchCategories);

export default router;
