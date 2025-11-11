import { Router } from "express";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import {
  createRazorPayPlan,
  deleteRazorPayPlan,
  getRazorPayPlans,
} from "../controllers/razorPay.controller";

const razorpayRouter = Router();

//Desc: It allows servicing team to fetch their customer's project list
razorpayRouter.get("/plans",getRazorPayPlans
  //   VerifyRole(["servicing"]),
);

razorpayRouter.post("/plans", createRazorPayPlan);
razorpayRouter.delete("/plans/:id", deleteRazorPayPlan);
export default razorpayRouter;
