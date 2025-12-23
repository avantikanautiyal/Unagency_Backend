import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
  createRequirement,
  getCustomerRequirement,
  getRequirement,
  getRequirmentById,
  updateCustomerRequirement,
} from "../controllers/requirement.controller";

const router = Router();
/* -------------------{ custoemr }-----------------------*/
//Desc: It allows customer to create their requirements.
router.post(
  "/create",
  VerifyRole(["customer"]),
  fileUpload.array("attach"),
  createRequirement
);
//Desc: It allows customer to get their requirement list
router.get("/", VerifyRole(["customer"]), getRequirement);
router.get("/get/:id", getRequirmentById);

/* -------------------{ servicing }-----------------------*/
//Desc: It allows servicing to fetch their customer's requirements list
router.get(
  "/:userId",
  VerifyRole(["admin", "superadmin", "servicing", "customer"]),
  getCustomerRequirement
);

//Desc: It allows servicing to update the status of Requirements
router.post(
  "/:reqId/:userId/:status",
  VerifyRole(["servicing"]),
  updateCustomerRequirement
);


export default router;
