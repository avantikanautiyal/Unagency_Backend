import { Router } from "express";
import { Register, Verify } from "../controllers/auth.controller";
const router = Router();

router.get("/verify", Verify);
router.get("/register", Register);
export default router;
