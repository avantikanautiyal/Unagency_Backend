import { Router } from "express";
import bodyParser from "body-parser";

import {
  CreateCheckOutSession,
  StripeWebhook,
} from "../controllers/stripe.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/webhook", StripeWebhook);
router.post(
  "/create-checkout-session",
  VerifyUserHandler,
  CreateCheckOutSession
);

export default router;
