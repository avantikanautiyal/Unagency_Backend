import { Router } from "express";
import { Register, Verify } from "../controllers/auth.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
const router = Router();

//Desc: It allow system to check if user is aunthenticated or not;
router.get("/verify", VerifyUserHandler, Verify);

router.post("/register", Register);
export default router;
