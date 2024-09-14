import Stripe from "stripe";
import CreateStripeCustomer from "../services/createStripeCustomer";
import stripeSession from "../services/stripeSession";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import CheckoutSession from "../models/checkoutsession.model";

const CreateCheckOutSession = asyncHandler(async (req: RequestUser, res) => {
  const { priceId } = req.body;
  if (!priceId) {
    return new ApiResponse(404, null, "Price Id  is required");
  }

  const customerData = {
    name: req?.user?.name || "",
    email: req?.user?.email || "",
  };
  const customerId = await CreateStripeCustomer(customerData);
  if (!customerId) {
    return new ApiError("Customer Id couldn't fetched", 401);
  }

  const sessionData = {
    priceId: priceId as string,
    customerId: customerId,
  };
  const session = await stripeSession(sessionData);
  return new ApiResponse(200, session, "Session Checkout");
});

const StripeWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;
  const payloadString = JSON.stringify(payload, null, 2);
  const stripe = new Stripe(`${process.env.stripe_secret_key}`);
  const sig = req.headers["stripe-signature"] as string;
  console.log(sig)
  let event;
  event = await stripe.webhooks.constructEventAsync(
    payloadString,
    sig,
    "REDACTED"
  );
  // event = stripe.webhooks.constructEvent(
  //   req.body,
  //   sig,
  //   process.env.stripe_webhook_endpoint_secret!
  // );

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
});

export { CreateCheckOutSession, StripeWebhook };
