import { Router } from "express";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";
import {
  buySubscription,
  createRazorPayPlan,
  deleteRazorPayPlan,
  getCustomerCurrentSubscription,
  getCustomerPaymentHistory,
  getPaymentHistory,
  getRazorPayPlans,
  getUserCurrentSubscription,
  getUSerSubscriptions,
  paymentVerification,
  paymentVerificationApp,
  generateInvoice,
  updateRazorPayPlan,
  updateSubscription,
  cancelUpdateSubscription,
  cancelSubscription,
} from "../controllers/razorPay.controller";

const razorpayRouter = Router();

// ###################### SUBSCRIPTIONS #########################

razorpayRouter.post("/subscriptions/create", VerifyUserHandler, buySubscription);
razorpayRouter.post("/subscriptions/update", VerifyUserHandler, updateSubscription);
razorpayRouter.post("/subscriptions/cancel-update", VerifyUserHandler, cancelUpdateSubscription);
razorpayRouter.post("/subscriptions/cancel", VerifyUserHandler, cancelSubscription);
razorpayRouter.get("/subscriptions", VerifyUserHandler, getUSerSubscriptions);
razorpayRouter.get("/subscriptions/current", VerifyUserHandler, getUserCurrentSubscription);
razorpayRouter.get("/subscriptions/customer/:userId", VerifyUserHandler, getCustomerCurrentSubscription);

razorpayRouter.post("/paymentVerification", paymentVerification);
razorpayRouter.post(
  "/paymentVerificationapp",
  VerifyUserHandler,
  paymentVerificationApp
);
razorpayRouter.get("/payment/history", VerifyUserHandler, getPaymentHistory)
razorpayRouter.get("/payment/history/:userId", VerifyUserHandler, getCustomerPaymentHistory);
razorpayRouter.get("/invoice/:paymentId", generateInvoice);
// ###################### PLANS #########################
// GET remains public for pricing UI. Mutations are admin-only and never create
// Razorpay plans — they only link/sync existing Plan IDs into Mongo.

razorpayRouter.get("/plans", getRazorPayPlans);

razorpayRouter.post(
  "/plans",
  VerifyUserHandler,
  VerifyRole(["admin", "superadmin"]),
  createRazorPayPlan
);
razorpayRouter.delete(
  "/plans/:plan_id",
  VerifyUserHandler,
  VerifyRole(["admin", "superadmin"]),
  deleteRazorPayPlan
);
razorpayRouter.put(
  "/plans/:plan_id",
  VerifyUserHandler,
  VerifyRole(["admin", "superadmin"]),
  updateRazorPayPlan
);
export default razorpayRouter;
