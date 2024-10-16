import { Router } from "express";
import {
  CreateUser,
  FetchCustomers,
  FetchInternalTeam,
  FetchResource,
  FetchUserByFirebaseId,
  UpdateUser,
} from "../controllers/users.controller";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";

const router = Router();
router.get(
  "/update/:firebaseId",
  VerifyRole(["admin", "superadmin"]),
  FetchUserByFirebaseId
);
router.post("/create-user", VerifyRole(["admin", "superadmin"]), CreateUser);
router.patch(
  "/update/:firebaseId",
  VerifyUserHandler,
  fileUpload.single("image"),
  UpdateUser
);

router.get(
  "/fetch-customers",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomers
);
router.get(
  "/fetch-resource",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchResource
);

router.get("/fetch-internal-team",VerifyRole(["admin", "superadmin"]), FetchInternalTeam);
router.get(":firebaseId", FetchUserByFirebaseId);

export default router;
