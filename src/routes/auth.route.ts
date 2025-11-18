import { Router } from "express";
import { Register, Verify,NewRegister, logout, registerFcmToken } from "../controllers/auth.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { RegisterIfNot } from "../middlewares/register.middleware";
const router = Router();

//Desc: It allow system to check if user is aunthenticated or not;
router.get("/verify",RegisterIfNot ,VerifyUserHandler, Verify);

router.post("/register", Register);
router.post("/register-login", NewRegister);
router.post("/logout",VerifyUserHandler ,logout);
router.post("/register-fcm", VerifyUserHandler,registerFcmToken)


export default router;
