import { Router } from "express";
import {
  CreateUser,
  FetchCustomers,
  FetchInternalTeam,
  FetchResource,
  FetchUserByFirebaseId,
} from "../controllers/users.controller";

const router = Router();
router.get("/update/:firebaseId", FetchUserByFirebaseId);
router.post("/create-user", CreateUser);
router.get("/fetch-customers", FetchCustomers);
router.get("/fetch-resource", FetchResource);

router.get("/fetch-internal-team", FetchInternalTeam);
router.get(":firebaseId", FetchUserByFirebaseId);

export default router;
