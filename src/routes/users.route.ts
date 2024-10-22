import { Router } from "express";
import {
  CreateUser,
  DisableUser,
  EnableUser,
  FetchCustomerById,
  FetchCustomers,
  FetchInternalTeam,
  FetchResource,
  SearchUsersInChat,
  FetchUserById,
  UpdateInternalUser,
  UpdateUser,
} from "../controllers/users.controller";
import { fileUpload } from "../middlewares/multers3.middleware";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/create-user", VerifyRole(["admin", "superadmin"]), CreateUser);

router.post(
  "/update-user",
  VerifyRole(["admin", "superadmin", "customer", "resource"]),
  fileUpload.single("image"),
  UpdateUser
);

router.post(
  "/update-internal-user",
  VerifyRole(["admin", "superadmin"]),
  UpdateInternalUser
); //Used by Rahul Arya

router.get(
  "/fetch-customers",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomers
);
router.get(
  "/fetch-customer/:customer",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomerById
);

router.get(
  "/fetch-resource",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchResource
);

router.get(
  "/fetch-internal-team",
  VerifyRole(["admin", "superadmin"]),
  FetchInternalTeam
);
router.post("/search", SearchUsersInChat);
router.get(
  "/disable-user/:firebaseID",
  VerifyRole(["admin", "superadmin"]),
  DisableUser
);
router.get(
  "/enable-user/:firebaseID",
  VerifyRole(["admin", "superadmin"]),
  EnableUser
);
router.get("/:id", FetchUserById);

export default router;
