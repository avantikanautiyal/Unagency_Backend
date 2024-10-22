import { Router } from "express";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
  createRequirement,
  getCustomerRequirement,
  getRequirement,
} from "../controllers/requirement.controller";

const router = Router();
/* -------------------{ custoemr }-----------------------*/

router.post(
  "/create",
  VerifyRole(["customer"]),
  fileUpload.array("attach"),
  createRequirement
);
router.get("/", VerifyRole(["customer"]), getRequirement);

/* -------------------{ servicing }-----------------------*/
router.get(
  "/:userId",
  VerifyRole(["admin", "super-admin", "servicing"]),
  getCustomerRequirement
);

export default router;
