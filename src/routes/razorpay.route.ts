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
razorpayRouter.post("/paymentVerificationapp", paymentVerificationApp);
razorpayRouter.get("/payment/history", VerifyUserHandler, getPaymentHistory)
razorpayRouter.get("/payment/history/:userId", VerifyUserHandler, getCustomerPaymentHistory);
razorpayRouter.get("/invoice/:paymentId", generateInvoice);
// ###################### PLANS #########################

//Desc: It allows servicing team to fetch their customer's project list
razorpayRouter.get(
  "/plans",
  getRazorPayPlans
  //   VerifyRole(["servicing"]),
);

razorpayRouter.post("/plans", createRazorPayPlan);
razorpayRouter.delete("/plans/:plan_id", deleteRazorPayPlan);
razorpayRouter.put("/plans/:plan_id", updateRazorPayPlan);
export default razorpayRouter;
