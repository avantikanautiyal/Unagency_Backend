import { Router } from "express";
import { Verify } from "../controllers/auth.controller";
const router = Router();

router.get("/verify", Verify);
export default router;
