import Stripe from "stripe";
import CreateStripeCustomer from "../services/createStripeCustomer";
import stripeSession from "../services/stripeSession";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import CheckoutSession from "../models/checkoutsession.model";
import Subscriptions from "../models/subscription.model";
import UpdateSubscription from "../services/updateCustomerSubscription";
import DeleteSubscription from "../services/deleteStripeSubscription";

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

const SubscriptionStatus = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  if (customerId == "") {
    return new ApiResponse(
      400,
      null,
      "Customer Id couldn't found. Please try again"
    );
  }
  const subscription = await Subscriptions.findOne({ customerId: customerId });
  return new ApiResponse(200, subscription, "Subscription Status");
});

const UpdateCustomerSubscription = asyncHandler(
  async (req: RequestUser, res) => {
    const { planId } = req.body;
    const subscriptionId = req.user?.subscriptionId ?? "";
    if (subscriptionId == "") {
      return new ApiResponse(
        400,
        null,
        "Subscription Id couldn't found. Please try again"
      );
    }

    const Update = await UpdateSubscription({ planId, subscriptionId });
    if (Update) {
      return new ApiResponse(200, Update, "Subscription update initiated");
    }
  }
);
const CancelCustomerSubscription = asyncHandler(
  async (req: RequestUser, res) => {
    const subscriptionId = req.user?.subscriptionId ?? "";
    if (subscriptionId == "") {
      return new ApiResponse(
        400,
        null,
        "Subscription Id couldn't found. Please try again"
      );
    }
    const Cancel = await DeleteSubscription({ subscriptionId });
    if (Cancel) {
      return new ApiResponse(200, Cancel, "Subscription cancel initiated");
    }
  }
);

const StripeWebhook = asyncHandler(async (req, res, buf) => {
  const sigHeader = req.headers["stripe-signature"] as string;
  const stripe = new Stripe(`${process.env.stripe_secret_key}`);
  let event;
  event = await stripe.webhooks.constructEventAsync(
    buf.toString(),
    sigHeader,
    "REDACTED"
  );

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const updatedSession = await CheckoutSession.findOneAndUpdate(
      { sessionId: session.id },
      {
        paymentStatus: session.payment_status,
        customerId: session.customer,
        amountTotal: session.amount_total,
        currency: session.currency,
      },
      { new: true }
    );

    if (!updatedSession) {
      await CheckoutSession.create({
        sessionId: session.id,
        customerId: session.customer,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
      });
      console.log("Payment session saved successfully");
    }
  }
  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object;
    await Subscriptions.create({
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      planId: subscription.items.data[0].plan.id, // Plan ID (assuming single plan for simplicity)
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000), // Convert to JS Date
      currentPeriodEnd: new Date(subscription.current_period_end * 1000), // Convert to JS Date
    });
    console.log("Subscription saved successfully");
  }
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    await Subscriptions.findOneAndUpdate(
      { subscriptionId: subscription.id },
      {
        status: subscription.status,
        planId: subscription.items.data[0].plan.id, // Updated Plan ID
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
      { new: true }
    );
    console.log("Subscription updated successfully");
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await Subscriptions.findOneAndUpdate(
      { subscriptionId: subscription.id },
      { status: "canceled" }
    );
    console.log("Subscription canceled");
  }
});

export {
  StripeWebhook,
  CreateCheckOutSession,
  UpdateCustomerSubscription,
  SubscriptionStatus,
  CancelCustomerSubscription,
};
