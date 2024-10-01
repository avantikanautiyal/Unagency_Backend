import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import {
  CancelCustomerSubscription,
  createCheckoutSession,
  createUserSubscription,
  fetchCheckoutSession,
  SubscriptionStatus,
  upgradeCustomerSubscription,
} from "../controllers/subscriptions.controller";
const router = Router();

router.post(
  "/create-checkout-session",
  VerifyUserHandler,
  createCheckoutSession
);
router.post(
  "/update-subscription",
  VerifyUserHandler,
  upgradeCustomerSubscription
);
router.get("/subscription-status", VerifyUserHandler, SubscriptionStatus);
router.post(
  "/create-user-subscription",
  VerifyUserHandler,
  createUserSubscription
);
router.get("/fetch-checkout-session", VerifyUserHandler, fetchCheckoutSession);
router.get(
  "/cancel-subscription",
  VerifyUserHandler,
  CancelCustomerSubscription
);

export default router;
