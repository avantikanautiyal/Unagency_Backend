import { Router } from "express";
import { Register, Verify, NewRegister, logout, registerFcmToken, forgetPassword, sendEmailVerificationEmail, verifyEmail, sendPhoneOtp, verifyPhoneOtp, sendEmailMagicLink } from "../controllers/auth.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { RegisterIfNot } from "../middlewares/register.middleware";
const router = Router();

//Desc: It allow system to check if user is aunthenticated or not;
router.get("/verify", RegisterIfNot, VerifyUserHandler, Verify);

router.post("/register", Register);
router.post("/register-login", NewRegister);
router.post("/logout", VerifyUserHandler, logout);
router.post("/register-fcm", VerifyUserHandler, registerFcmToken);
router.post("/forget-password", forgetPassword);
router.post("/send-email-verification", sendEmailVerificationEmail);
router.get("/verify-email", verifyEmail);

// Phone OTP (server-side HMAC store + Firebase custom token)
router.post("/send-phone-otp", sendPhoneOtp);
router.post("/verify-phone-otp", verifyPhoneOtp);

// Email magic link (passwordless)
router.post("/send-email-magic-link", sendEmailMagicLink);

export default router;
