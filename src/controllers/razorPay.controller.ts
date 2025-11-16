import { PlansModel } from "../models/plan.model";
import Subscriptions from "../models/subscription.model";
import { RequestUser } from "../types/user";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import razorpayInstance from "../utils/razorpayInstance";
import Users from "../models/users.model";
import crypto from "crypto";
import Payments from "../models/payment.model";

// creating a razor-pay subscription
export const buySubscription = asyncHandler(async (req: RequestUser) => {
  //   const userId = req.user?.userId;
  //   console.log(req.body);
  if (!req?.body?.plan_id) throw new ApiError("plan_id required ", 400);

  const user = await Users.findById(req.user?.userId);

  if (
    user?.subscription?.id &&
    ["pending", "active"].includes(user?.subscription?.status)
  ) {
    throw new ApiError(
      "Please cancel a current subscription before taking a new subscription",
      400
    );
  }

  const subscription = await razorpayInstance.subscriptions.create({
    plan_id: req.body.plan_id,
    customer_notify: 1,
    quantity: 1,
    total_count: 1,
    // customer_id : userId

    // req.body.customer_id,
    // quantity : req.body.quantity,
    // currency : req.body.currency,
    // description : req.body.description,
    // notes : req.body.notes,
  });

  //   console.log("subscription ", subscription);
  const createUserSubscription = await Subscriptions.create({
    subscriptionId: subscription.id,
    userId: req.user?.userId,
    planId: subscription.plan_id,
    status: subscription.status,
    start_at: subscription.current_start,
    expire_by: subscription.current_start,
  });

  // await Users.updateOne(
  //   { _id: req.user?.userId },
  //   {
  //     $set: {
  //       subscription: { id: subscription.id, status: subscription.status },
  //     },
  //   }
  // );
  return new ApiResponse(
    200,
    createUserSubscription,
    "RazorPay Subscription created successfully"
  );
});

export const getUSerSubscriptions = asyncHandler(async (req: RequestUser) => {
  const userId = req.user?.userId;
  if (!userId) throw new ApiError("UserId not present", 400);

  // console.log("user " , req.user) ;

  const subscription = await Subscriptions.find({
    userId,
  }).populate({ path: "planId", foreignField: "plan_id" });

  return new ApiResponse(200, subscription, "All subscriptions");
});
export const getUserCurrentSubscription = asyncHandler(
  async (req: RequestUser) => {
    const userId = req.user?.userId;
    if (!userId) throw new ApiError("UserId not present", 400);

    // console.log(req.user);

    const subscription = await Subscriptions.findOne({
      subscriptionId: req.user?.subscription?.id,
      // status: { $in: ["active", "pending"] },
    }).populate({ path: "planId", foreignField: "plan_id" });

    return new ApiResponse(200, subscription, "All subscriptions");
  }
);

export const paymentVerification = asyncHandler(
  async (req: RequestUser, res) => {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      ...rest
    } = req.body;
    console.log(
      "razopay verification props ",
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    );
    // const user = await Users.findById(req.user?.userId);
    // const subscriptionId = user?.subscription?.id;
    const user: any = await Users.find({
      "subscription.id": razorpay_subscription_id,
    });

    const generated_signature = crypto
      .createHmac("sha256", process.env?.RAZORPAY_SECRET!)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id, "utf-8")
      .digest("hex");

    const isValidSignature = generated_signature == razorpay_signature;
    if (!isValidSignature)
      res.redirect(process.env.FRONTEND_URL + "/paymentfail");

    await Payments.create({
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      userId: user?._id!,
    });

    res.redirect(
      process.env.FRONTEND_URL +
        "/payment-success?payment_id=" +
        razorpay_payment_id +
        "&subscription_id=" +
        razorpay_subscription_id
    );
    // data base comes here
    // await
  }
);
export const paymentVerificationApp = asyncHandler(
  async (req: RequestUser, res) => {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      ...rest
    } = req.body;
    console.log(
      "razopay verification props ",
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    );
    // const user = await Users.findById(req.user?.userId);
    // const subscriptionId = user?.subscription?.id;
    const user: any = await Users.find({
      "subscription.id": razorpay_subscription_id,
    });

    const generated_signature = crypto
      .createHmac("sha256", process.env?.RAZORPAY_SECRET!)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id, "utf-8")
      .digest("hex");

    const isValidSignature = generated_signature == razorpay_signature;
    if (!isValidSignature)
      res.redirect(process.env.FRONTEND_URL + "/payment-fail");

    await Payments.create({
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      userId: user?._id!,
    });

    res.redirect(
      process.env.FRONTEND_URL +
        "/payment-success?payment_id=" +
        razorpay_payment_id +
        +"&subscription_id=" +
        razorpay_subscription_id
    );
    // data base comes here
    // await
  }
);

// for Plans
export const getRazorPayPlans = asyncHandler(async (req: RequestUser) => {
  // const palns = await razorpayInstance.plans.all();
  const plans = await PlansModel.find({});
  return new ApiResponse(200, plans, "RazorPay Plans fetched successfully");
});
export const createRazorPayPlan = asyncHandler(async (req: RequestUser) => {
  const { plan_id, ...rest } = req.body;

  if (!plan_id) throw new ApiError("Plan ID is required", 400);

  const plan = await razorpayInstance.plans.fetch(plan_id);

  const newPlan = await PlansModel.create({
    plan_id: plan_id,
    razorpayPlanItem: plan,
    ...rest,
  });
  return new ApiResponse(200, newPlan, "RazorPay Plan created successfully");
});
export const deleteRazorPayPlan = asyncHandler(async (req: RequestUser) => {
  const { plan_id } = req.params;

  if (!plan_id) throw new ApiError("Plan ID is required", 400);

  await PlansModel.findByIdAndDelete(plan_id);
  return new ApiResponse(200, null, "RazorPay Plan deleted successfully");
});
