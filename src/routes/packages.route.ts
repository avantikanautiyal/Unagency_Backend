import { Router } from "express";
import {
  CreatePackage,
  DeletePackage,
  fetchPackage,
  fetchPackageById,
  UpdatePackage,
} from "../controllers/packages.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
//Desc:  TO update Package
router.post("/update/:id", UpdatePackage);
//Desc: To Delete Package
router.post("/delete/:id", DeletePackage);
//Desc: It allows to fetch a package using its id
router.get("/:id", VerifyRole(["superadmin"]), fetchPackageById);
//Desc: It allows superadmin to create a package
router.post("/", VerifyRole(["superadmin"]), CreatePackage);
//Desc: It allows superadmin to fetch all packages
router.get(
  "/",
  VerifyRole(["superadmin", "customer", "servicing", "admin"]),
  fetchPackage
);

export default router;
