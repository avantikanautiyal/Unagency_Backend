import { Router } from "express";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";
import {
  buySubscription,
  createRazorPayPlan,
  deleteRazorPayPlan,
  getRazorPayPlans,
  paymentVerification,
} from "../controllers/razorPay.controller";

const razorpayRouter = Router();

// ###################### SUBSCRIPTIONS #########################

razorpayRouter.post("/subscriptions/create", VerifyUserHandler, buySubscription);
razorpayRouter.post("/paymentVerification" , paymentVerification)

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
