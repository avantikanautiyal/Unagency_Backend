import { Router } from "express";
import {
  createStaff,
  deleteStaff,
  fetchStaff,
  fetchStaffById,
  updateStaff,
} from "../controllers/staff.controller";

const router = Router();
router.post("/delete/:id", deleteStaff);
router.get("/update/:id", updateStaff);
router.get("/:id", fetchStaffById);
router.post("/", createStaff);
router.get("/", fetchStaff);

export default router;
