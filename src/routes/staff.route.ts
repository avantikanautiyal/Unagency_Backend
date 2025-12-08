import { Router } from "express";
import {
  AssignManagerToCustomer,
  createStaff,
  deleteStaff,
  fetchStaff,
  fetchStaffById,
  updateStaff,
} from "../controllers/staff.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post(
  "/assign-manager",
  VerifyRole(["admin", "superadmin"]),
  AssignManagerToCustomer
);
router.delete("/delete/:id", VerifyRole(["admin", "superadmin"]), deleteStaff);
router.post("/update/:id", VerifyRole(["admin", "superadmin"]), updateStaff);
router.get("/:id", VerifyRole(["admin", "superadmin"]), fetchStaffById);
router.post("/", VerifyRole(["admin", "superadmin"]), createStaff);
router.get("/", VerifyRole(["admin", "superadmin"]), fetchStaff);

export default router;
