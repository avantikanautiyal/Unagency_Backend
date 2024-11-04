import { Router } from "express";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";
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
// Desc : its creates a customer checkout session
router.post(
  "/create-checkout-session",
  VerifyRole(["customer"]),
  createCheckoutSession
);
//IT allow customer to check subscription Status
router.get(
  "/subscription-status",
  VerifyRole(["customer"]),
  SubscriptionStatus
);

//Desc: It allow customer to upgrade and downgrade their current subscription
router.post(
  "/update-subscription",
  VerifyRole(["customer"]),
  upgradeCustomerSubscription
);

//Desc: It allow customer to fetch session Details
router.get(
  "/fetch-checkout-session",
  VerifyRole(["customer"]),
  fetchCheckoutSession
);

//It is used to create customer Subscription
router.post(
  "/create-user-subscription",
  VerifyRole(["customer"]),
  createUserSubscription
);

//It is used to cancel current subscription
router.get(
  "/cancel-subscription",
  VerifyRole(["customer"]),
  CancelCustomerSubscription
);

//It is used to check customer payment methods and default payment method
router.get("/payment-methods", VerifyRole(["customer"]), UserPaymentMethods);

//It is used to create a payment method
router.post(
  "/create-payment-method",
  VerifyRole(["customer"]),
  CreatePaymentMethod
);

//It is used to create a payment method to defaul by customer
router.post(
  "/make-default-payment-method",
  VerifyRole(["customer"]),
  MakeDefaultPaymentMethod
);

//It is used to detach payment method
router.post(
  "/remove-payment-method",
  VerifyRole(["customer"]),
  RemovePaymentMethod
);

export default router;
