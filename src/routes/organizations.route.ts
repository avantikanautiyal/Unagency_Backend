import { Router } from "express";
import {
  createOrganization,
  UpdateUserOrganization,
  UserOrganization,
  OrganizationByUserId,
} from "../controllers/organizations.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post(
  "/update/:organizationId",
  VerifyRole(["customer"]),
  UpdateUserOrganization
);
//Desc: It allows user to find their organization information;
router.get("/user-organization", VerifyRole(["customer"]), UserOrganization);
//Desc: It allows system to find user's organization information;
router.get(
  "/:userId",
  VerifyRole(["servicing", "admin", "superadmin"]),
  OrganizationByUserId
);
//Desc: It allows customer to create their organization
router.post("/", VerifyRole(["customer"]), createOrganization);

export default router;
