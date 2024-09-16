import express, { Router } from "express";

import {
  CancelCustomerSubscription,
  CreateCheckOutSession,
  SubscriptionStatus,
  UpdateCustomerSubscription,
  // StripeWebhook,
} from "../controllers/stripe.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post(
  "/create-checkout-session",
  VerifyUserHandler,
  CreateCheckOutSession
);
router.post(
  "/update-subscription",
  VerifyUserHandler,
  UpdateCustomerSubscription
);
router.post("/subscription-status", VerifyUserHandler, SubscriptionStatus);
router.post("/cancel-subscription", VerifyUserHandler, CancelCustomerSubscription);

export default router;
