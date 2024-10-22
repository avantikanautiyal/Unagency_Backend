import { Router } from "express";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
  createRequirement,
  getCustomerRequirement,
} from "../controllers/requirement.controller";

const router = Router();
router.post("/create", fileUpload.array("attach"), createRequirement);
router.get(
  "/:userId",
  VerifyRole(["superadmin", "admin", "servicing"]),
  getCustomerRequirement
);

export default router;
