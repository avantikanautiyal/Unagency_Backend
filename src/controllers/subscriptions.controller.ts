import Subscriptions from "../models/subscription.model";
import CancelSubscription from "../services/subscription/cancelSubscription";
import CreateCustomer from "../services/subscription/createCustomer";
import createSession from "../services/subscription/createSession";
import CreateSubscription from "../services/subscription/createSubscription";
import RetrieveSession from "../services/subscription/retrieveSession";
import upgradeSubscription from "../services/subscription/upgradeSubscription";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const createCheckoutSession = asyncHandler(async (req: RequestUser, res) => {
  const { priceId } = req.body;
  if (!priceId) {
    return new ApiResponse(404, null, "Price Id  is required");
  }
  const customerData = {
    name: req?.user?.name || "",
    email: req?.user?.email || "",
  };

  const customerId = await CreateCustomer(customerData);
  if (!customerId) {
    return new ApiResponse(200, null, "Customer Id couldn't fetched");
  }

  const sessionData = {
    priceId: priceId as string,
    customerId: customerId,
  };
  const session = await createSession(sessionData);
  return new ApiResponse(200, session, "Session Checkout");
});

const fetchCheckoutSession = asyncHandler(async (req: RequestUser, res) => {
  const { session_id } = req.query;
  if (!session_id) {
    return new ApiResponse(404, null, "Session Id  is required");
  }

  const session = RetrieveSession(session_id as string);
  return new ApiResponse(200, session, "Session details fetched successfully");
});

const createUserSubscription = asyncHandler(async (req: RequestUser, res) => {
  const { priceId } = req.body;
  if (!priceId) {
    return new ApiResponse(404, null, "Price Id  is required");
  }
  const customerId = req.user?.customerId;
  if (!customerId) {
    return new ApiResponse(401, null, "Customer Id couldn't fetched");
  }

  const subscriptionData = {
    priceId: priceId as string,
    customerId: customerId,
  };
  const subscription = await CreateSubscription(subscriptionData);
  return new ApiResponse(200, subscription, "subscription initiated");
});

const SubscriptionStatus = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  if (customerId == "") {
    return new ApiResponse(200, null, "Use is not a customer yet.");
  }
  const subscription = await Subscriptions.findOne({ customerId: customerId });
  return new ApiResponse(
    200,
    subscription,
    "Subscription fetched successfully"
  );
});

const upgradeCustomerSubscription = asyncHandler(
  async (req: RequestUser, res) => {
    const { priceId } = req.body;
    const subscriptionId = req.user?.subscriptionId ?? "";
    if (subscriptionId == "") {
      return new ApiResponse(
        400,
        null,
        "Subscription Id couldn't found. Please try again"
      );
    }
    const upgrade = await upgradeSubscription({ priceId, subscriptionId });
    return new ApiResponse(200, upgrade, "subscription upgraded");
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
    const Cancel = await CancelSubscription({ subscriptionId });
    if (Cancel) {
      return new ApiResponse(200, Cancel, "Subscription cancel initiated");
    }
  }
);

export {
  createCheckoutSession,
  fetchCheckoutSession,
  SubscriptionStatus,
  createUserSubscription,
  upgradeCustomerSubscription,
  CancelCustomerSubscription,
};
