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
} from "../controllers/razorPay.controller";

const razorpayRouter = Router();

// ###################### SUBSCRIPTIONS #########################

razorpayRouter.post("/subscriptions/create", VerifyUserHandler, buySubscription);
razorpayRouter.get("/subscriptions", VerifyUserHandler, getUSerSubscriptions);
razorpayRouter.get("/subscriptions/current", VerifyUserHandler, getUserCurrentSubscription);
razorpayRouter.get("/subscriptions/customer/:userId", VerifyUserHandler, getCustomerCurrentSubscription);

razorpayRouter.post("/paymentVerification", paymentVerification);
razorpayRouter.post("/paymentVerificationapp", paymentVerificationApp);
razorpayRouter.get("/payment/history", VerifyUserHandler, getPaymentHistory)
razorpayRouter.get("/payment/history/:userId", VerifyUserHandler, getCustomerPaymentHistory)
// ###################### PLANS #########################

//Desc: It allows servicing team to fetch their customer's project list
razorpayRouter.get(
  "/plans",
  getRazorPayPlans
  //   VerifyRole(["servicing"]),
);

razorpayRouter.post("/plans", createRazorPayPlan);
razorpayRouter.delete("/plans/:id", deleteRazorPayPlan);
export default razorpayRouter;
