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
router.post("/delete/:id", VerifyRole(["admin", "superadmin"]), deleteStaff);
router.post("/update/:id", VerifyRole(["admin", "superadmin"]), updateStaff);
router.get("/:id", VerifyRole(["admin", "superadmin"]), fetchStaffById);
router.post("/", VerifyRole(["admin", "superadmin"]), createStaff);
router.get("/", VerifyRole(["admin", "superadmin"]), fetchStaff);

export default router;
