import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import {
  CancelCustomerSubscription,
  createCheckoutSession,
  CreatePaymentMethod,
  createUserSubscription,
  fetchCheckoutSession,
  MakeDefaultPaymentMethod,
  RemovePaymentMethod,
  SubscriptionStatus,
  upgradeCustomerSubscription,
  UserPaymentMethods,
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
router.get("/payment-methods", VerifyUserHandler, UserPaymentMethods);
router.post("/create-payment-method", VerifyUserHandler, CreatePaymentMethod);
router.get(
  "/cancel-subscription",
  VerifyUserHandler,
  CancelCustomerSubscription
);
router.post(
  "/make-default-payment-method",
  VerifyUserHandler,
  MakeDefaultPaymentMethod
);
router.post(
  "/remove-payment-method",
  VerifyUserHandler,
  RemovePaymentMethod
);

export default router;
