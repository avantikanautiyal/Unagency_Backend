import { Router } from "express";
import {
  CreateCheckOutSession,
  StripeWebhook,
} from "../controllers/stripe.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import Stripe from "stripe";
import CheckoutSession from "../models/checkoutsession.model";

const router = Router();
router.post(
  "/webhook",
  VerifyUserHandler,
  asyncHandler(async (req, res) => {
    const stripe = new Stripe(`${process.env.stripe_secret_key}`);
    const sig = req.headers["stripe-signature"] as string;
    let event;
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.stripe_webhook_endpoint_secret!
    );

    console.log(event.type);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await CheckoutSession.create({
        sessionId: session.id,
        customerId: session.customer,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
      });
      console.log("Payment session saved successfully");
    }
  })
);
router.post(
  "/create-checkout-session",
  VerifyUserHandler,
  CreateCheckOutSession
);

export default router;
