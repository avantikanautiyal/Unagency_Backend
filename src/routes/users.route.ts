import { Router } from "express";
import {
  CreateUser,
  DisableUser,
  EnableUser,
  FetchCustomerById,
  FetchCustomerPlan,
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
// Desc: its used for creating a user from the admin pannel
router.post("/create-user", VerifyRole(["admin", "superadmin"]), CreateUser);
// Desc: It allows user (all) to update their account and profile in settings
router.post(
  "/update-user",
  VerifyRole(["admin", "superadmin", "customer", "resource"]),
  fileUpload.single("image"),
  UpdateUser
);
//Desc: It allows super admin and admin to update their users data
router.post(
  "/update-internal-user",
  VerifyRole(["admin", "superadmin"]),
  UpdateInternalUser
);

//Desc: It allows superadmin, admin, and servicing to fetch their assigned customers
router.get(
  "/fetch-customers",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomers
);
//Desc: It allows superadmin, admin and servicing to get a customer's information
router.get(
  "/fetch-customer/:customer",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomerById
);
//Desc: It allows superadmin, admin, and servicing to find their customer's plan and invoice details
router.get(
  "/fetch-customer-plan/:customer",
  VerifyRole(["admin", "superadmin", "servicing"]),
  FetchCustomerPlan
);
//Desc:  It allows to give a list of resource while creating a project for a customer.
router.get("/fetch-resource", VerifyRole(["servicing"]), FetchResource);
//Desc: It allows to give a list of users except customer and superadmin.
router.get(
  "/fetch-internal-team",
  VerifyRole(["admin", "superadmin"]),
  FetchInternalTeam
);
//Desc: It allows users(servicing and resource) to search users; (This Api is used in Chat Module)
router.post(
  "/search",
  VerifyRole(["servicing", "resource"]),
  SearchUsersInChat
);
//Desc: This allows to disable a user.
router.get(
  "/disable-user/:firebaseID",
  VerifyRole(["admin", "superadmin"]),
  DisableUser
);
//Desc: It allows to enable a user.
router.get(
  "/enable-user/:firebaseID",
  VerifyRole(["admin", "superadmin"]),
  EnableUser
);
//Desc: It is used in Chat Module of Messaging for User role. NOTE: TAPI
router.get("/:id", FetchUserById);

export default router;
