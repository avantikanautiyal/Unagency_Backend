import { Router } from "express";
import {
  CreateCheckOutSession,
  StripeWebhook,
} from "../controllers/stripe.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/create-checkout-session", VerifyUserHandler, CreateCheckOutSession);
router.post("/webhook", VerifyUserHandler, StripeWebhook);

export default router;
