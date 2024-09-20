import { Router } from "express";
import { Register, Verify } from "../controllers/auth.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
const router = Router();

router.get("/verify", VerifyUserHandler, Verify);
router.post("/register", Register);
export default router;
