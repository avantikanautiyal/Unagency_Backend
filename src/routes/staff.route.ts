import { Router } from "express";
import {
  createStaff,
  deleteStaff,
  fetchStaff,
  fetchStaffById,
  updateStaff,
} from "../controllers/staff.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/delete/:id", deleteStaff);
router.post("/update/:id", updateStaff);
router.get("/:id", fetchStaffById);
router.post("/", createStaff);
router.get("/", VerifyRole(["admin", "superadmin"]), fetchStaff);

export default router;
