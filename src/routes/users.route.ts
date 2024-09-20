import { Router } from "express";
import {
  CreateUser,
  FetchCustomers,
  FetchInternalTeam,
  FetchUserByFirebaseId,
} from "../controllers/users.controller";

const router = Router();
router.get("/update/:firebaseId", FetchUserByFirebaseId);
router.post("/create-user", CreateUser);
router.get("/fetch-customers", FetchCustomers);
router.get("/fetch-internal-team", FetchInternalTeam);
router.get(":firebaseId", FetchUserByFirebaseId);

export default router;
