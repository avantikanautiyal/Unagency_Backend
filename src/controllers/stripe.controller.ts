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
const FetchCheckOutSession = asyncHandler(async (req: RequestUser, res) => {
  const { session_id } = req.query;
  const stripe = new Stripe(`${process.env.stripe_secret_key}`);
  if (!session_id) {
    return new ApiResponse(404, null, "Session Id  is required");
  }

  const session = await stripe.checkout.sessions.retrieve(session_id as string);
  return new ApiResponse(200, session, "Session details fetched successfully");
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

//This controller will help users to upgrade and downgrade their package.
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

export {
  // StripeWebhook,
  FetchCheckOutSession,
  CreateCheckOutSession,
  UpdateCustomerSubscription,
  SubscriptionStatus,
  CancelCustomerSubscription,
};
