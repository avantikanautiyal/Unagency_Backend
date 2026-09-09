import { Router } from "express";
import {
  createOrganization,
  UpdateUserOrganization,
  UserOrganization,
  OrganizationByUserId,
  OrganizationsByOwners,
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
//Desc: Batch org lookup for admin/CS/resource dashboards (must be before /:userId)
router.post(
  "/by-owners",
  VerifyRole(["servicing", "admin", "superadmin", "resource"]),
  OrganizationsByOwners
);
//Desc: It allows system to find user's organization information;
router.get(
  "/:userId",
  VerifyRole(["servicing", "admin", "superadmin", "resource"]),
  OrganizationByUserId
);
//Desc: It allows customer to create their organization
router.post("/", VerifyRole(["customer"]), createOrganization);

export default router;
