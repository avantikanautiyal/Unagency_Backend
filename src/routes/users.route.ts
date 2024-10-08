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
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.get("/update/:firebaseId", FetchUserByFirebaseId);
router.post("/create-user", CreateUser);
router.patch("/update/:firebaseId",
  VerifyUserHandler,
  fileUpload.single("image"),
  UpdateUser);

router.get("/fetch-customers", FetchCustomers);
router.get("/fetch-resource", FetchResource);

router.get("/fetch-internal-team", FetchInternalTeam);
router.get(":firebaseId", FetchUserByFirebaseId);

export default router;
