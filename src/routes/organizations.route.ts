import { Router } from "express";
import {
  createOrganization,
  fetchOrganizations,
  UpdateUserOrganization,
  UserOrganization,
} from "../controllers/organizations.controller";

const router = Router();
// router.post("/update/:id", UpdatePackage);
// router.post("/delete/:id", DeletePackage);
// router.get("/:id", fetchPackageById);
router.post("/update/:organizationId", UpdateUserOrganization);
router.get("/user-organization", UserOrganization);
router.post("/", createOrganization);
router.get("/", fetchOrganizations);

export default router;
