import express, { Router } from "express";

import {
  CancelCustomerSubscription,
  CreateCheckOutSession,
  CreateUserSubscriptionController,
  FetchCheckOutSession,
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
router.get("/subscription-status", VerifyUserHandler, SubscriptionStatus);
router.post("/create-user-subscription", VerifyUserHandler, CreateUserSubscriptionController);
router.get("/fetch-checkout-session", VerifyUserHandler, FetchCheckOutSession);
router.get(
  "/cancel-subscription",
  VerifyUserHandler,
  CancelCustomerSubscription
);

export default router;
