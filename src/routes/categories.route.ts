import { Router } from "express";
import {
  createCategory,
  fetchCategories,
  deleteCategory,
  updateCategory,
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
router.delete(
  "/:categoryId",
  VerifyRole(["admin", "superadmin"]),
  deleteCategory
);

router.put(
  "/:categoryId",
  VerifyRole(["admin", "superadmin"]),
  fileUpload.single("featuredImage"),
  updateCategory
);

export default router;
