import Subscriptions from "../models/subscription.model";
import RetrievePriceAndProduct from "../services/retrievePrice";
import CancelSubscription from "../services/subscription/cancelSubscription";
import CreateCustomer from "../services/subscription/createCustomer";
import createSession from "../services/subscription/createSession";
import CreateSubscription from "../services/subscription/createSubscription";
import createUserPaymentMethod from "../services/subscription/createUserPaymentMethod";
import InvoiceHistory from "../services/subscription/invoiceHistory";
import MakeUserDefaultPaymentMethod from "../services/subscription/makeDefaultPaymentMethod";
import PaymentMethods from "../services/subscription/paymentMethods";
import RemoveUserPaymentMethod from "../services/subscription/removePaymentMethod";
import RetrieveSession from "../services/subscription/retrieveSession";
import upgradeSubscription from "../services/subscription/upgradeSubscription";
import { RequestUser } from "../types/user";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
//TESTED OK
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

//TESTED OK
const SubscriptionStatus = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  if (customerId == "") {
    return new ApiResponse(200, null, "User is not a customer yet.");
  }

  const subscription = await Subscriptions.findOne({
    customerId: customerId,
    status: { $ne: "canceled" },
  });
  let subscribedPackage;
  if (subscription) {
    subscribedPackage = await RetrievePriceAndProduct({
      priceId: subscription?.planId as string,
    });
  }

  return new ApiResponse(
    200,
    { subscription, ...subscribedPackage },
    "Subscription fetched successfully"
  );
});

//TESTED OK
// const upgradeCustomerSubscription = asyncHandler(
//   async (req: RequestUser, res) => {
//     const { priceId } = req.body;
//     const subscriptionId = req.user?.subscriptionId ?? "";
//     if (subscriptionId == "") {
//       return new ApiResponse(
//         400,
//         null,
//         "Subscription Id couldn't found. Please try again"
//       );
//     }
//     const upgrade = await upgradeSubscription({ priceId, subscriptionId });
//     return new ApiResponse(200, upgrade, "subscription upgraded");
//   }
// );

//TESTED OK
const fetchCheckoutSession = asyncHandler(async (req: RequestUser, res) => {
  const { session_id } = req.query;
  if (!session_id) {
    return new ApiResponse(404, null, "Session Id  is required");
  }
  const session = await RetrieveSession(session_id as string);

  return new ApiResponse(200, session, "Session details fetched successfully");
});

//TESTED OK
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

//TESTED OK
// const CancelCustomerSubscription = asyncHandler(
//   async (req: RequestUser, res) => {
//     const subscriptionId = req.user?.subscriptionId ?? "";
//     if (subscriptionId == "") {
//       return new ApiResponse(
//         400,
//         null,
//         "Subscription Id couldn't found. Please try again"
//       );
//     }
//     const Cancel = await CancelSubscription({ subscriptionId });
//     if (Cancel) {
//       return new ApiResponse(200, Cancel, "Subscription cancel initiated");
//     }
//   }
// );

//TESTED OK
const UserPaymentMethods = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  if (customerId == "") {
    return new ApiResponse(200, null, "User is not a customer yet.");
  }
  const paymentmethodsList = await PaymentMethods(customerId);
  if (paymentmethodsList) {
    return new ApiResponse(
      200,
      paymentmethodsList,
      "Payment Method List fetched"
    );
  }
});

//TESTED OK
const CreatePaymentMethod = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  const token = req.body?.token;
  const cardHolder = req.body?.cardHolder;
  if (customerId == "") {
    return new ApiResponse(200, null, "User is not a customer yet.");
  }
  const pamentMethod = await createUserPaymentMethod(
    customerId,
    token,
    cardHolder
  );
  if (pamentMethod) {
    return new ApiResponse(
      200,
      pamentMethod,
      "Payment Method created successfully"
    );
  }
});

//TESTED Ok
const MakeDefaultPaymentMethod = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  const paymentMethodId = req.body?.payment_method_id;
  if (customerId == "") {
    return new ApiResponse(200, null, "User is not a customer yet.");
  }
  const pamentMethod = await MakeUserDefaultPaymentMethod(
    customerId,
    paymentMethodId
  );
  if (pamentMethod) {
    return new ApiResponse(
      200,
      pamentMethod,
      "Made Default Payment Method successfully"
    );
  }
});

//TESTED OK
const RemovePaymentMethod = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  const paymentMethodId = req.body?.payment_method_id;
  if (customerId == "") {
    return new ApiResponse(200, null, "User is not a customer yet.");
  }
  const Remove = await RemoveUserPaymentMethod(paymentMethodId);
  if (Remove) {
    return new ApiResponse(200, Remove, "Payment Method detached successfully");
  }
});

const invoiceHistory = asyncHandler(async (req: RequestUser, res) => {
  const customerId = req.user?.customerId ?? "";
  if (!customerId) {
    return new ApiResponse(200, null, "User is not a customer yet");
  }
  const invoices = await InvoiceHistory(customerId);
  if (!invoices) {
    return new ApiResponse(400, null, "Couldn't fetch invoice history");
  }
  return new ApiResponse(200, invoices, "Invoice history fetched successfully");
});

export {
  createCheckoutSession,
  fetchCheckoutSession,
  SubscriptionStatus,
  createUserSubscription,
  // upgradeCustomerSubscription,
  // CancelCustomerSubscription,
  UserPaymentMethods,
  CreatePaymentMethod,
  MakeDefaultPaymentMethod,
  RemovePaymentMethod,
  invoiceHistory,
};
