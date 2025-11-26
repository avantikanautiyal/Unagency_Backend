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
import puppeteer from "puppeteer";
import { InvoiceHTMLTemplate } from "../utils/invoiceTemplate";

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
  return new ApiResponse(
    200,
    createUserSubscription,
    "RazorPay Subscription created successfully"
  );
});

export const cancelSubscription = asyncHandler(async (req: RequestUser) => {

  const subscription_id = req.user?.subscription?.id;
  if (!subscription_id) throw new ApiError("subscription id is missing", 400);
  const razrerSubscription = await razorpayInstance.subscriptions.cancel(subscription_id, true);

  await Users.findOneAndUpdate(
    { _id: req.user?.userId },
    {
      $set: {
        "subscription.id": subscription_id,
        "subscription.status": razrerSubscription.status,
      },
    },
    { new: true }
  );

  const subs = await Subscriptions.findOneAndUpdate(
    { subscriptionId: subscription_id },
    {
      status: razrerSubscription.status
    },
    { new: true }
  );

  return new ApiResponse(200, subs, "subscription Canceled");

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
    const razerpSubscription: any = await razorpayInstance.subscriptions.fetch(req.user?.subscription?.id!);
    const subscription = await Subscriptions.findOne({
      subscriptionId: req.user?.subscription?.id,
    }).populate({ path: "planId", foreignField: "plan_id" });

    const curSubsc = {
      ...(subscription?.toObject()), status: razerpSubscription.status,

      email: razerpSubscription?.customer_email!,
      contact: razerpSubscription?.customer_contact!,
      payment_method: razerpSubscription?.payment_method!,
    }
    return new ApiResponse(200, curSubsc, "All subscriptions");
  }
);
// route for the service , admin
export const getCustomerCurrentSubscription = asyncHandler(
  async (req: RequestUser) => {
    const userId = req.params?.userId;
    if (!userId) throw new ApiError("UserId not present", 400);

    const user = await Users.findById(userId);
    const razerpSubscription: any = await razorpayInstance.subscriptions.fetch(user?.subscription?.id!);
    const subscription = await Subscriptions.findOne({
      subscriptionId: user?.subscription?.id,
    }).populate({ path: "planId", foreignField: "plan_id" });

    // const curSubsc = { ...subscription, status: razerpSubscription.status }

    const curSubsc = {
      ...(subscription?.toObject()), status: razerpSubscription.status,

      email: razerpSubscription?.customer_email!,
      contact: razerpSubscription?.customer_contact!,
      payment_method: razerpSubscription?.payment_method!,
    }

    return new ApiResponse(200, curSubsc, "All subscriptions");
  }
);

export const paymentVerification = asyncHandler(
  async (req: RequestUser, res) => {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;
    console.log(
      "razopay verification props ",
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature
    );

    const generated_signature = crypto
      .createHmac("sha256", process.env?.RAZORPAY_SECRET!)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id, "utf-8")
      .digest("hex");

    const isValidSignature = generated_signature == razorpay_signature;
    if (!isValidSignature)
      res.redirect(process.env.FRONTEND_URL + "/paymentfail");

    const subs = await Subscriptions.findOne({
      subscriptionId: razorpay_subscription_id,
    });

    await Payments.create({
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      userId: subs?.userId,
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

export const getPaymentHistory = asyncHandler(async (req: RequestUser, res) => {
  const userPaymentHistory = await Payments.find({
    userId: req.user?.userId,
  }).populate({
    path: "razorpay_subscription_id",
    foreignField: "subscriptionId",
    populate: {
      path: "planId", // field inside subscription,
      foreignField: "plan_id",
    },
  });

  return new ApiResponse(
    200,
    userPaymentHistory,
    "payment histroy fetched successfully "
  );
});

export const getCustomerPaymentHistory = asyncHandler(async (req: RequestUser, res) => {

  const userId = req.params?.userId;
  if (!userId) throw new ApiError("UserId not present", 400);

  const user = await Users.findById(userId);
  if (!user) throw new ApiError("User not found", 404);

  const userPaymentHistory = await Payments.find({
    userId: userId,
  }).populate({
    path: "razorpay_subscription_id",
    foreignField: "subscriptionId",
    populate: {
      path: "planId", // field inside subscription,
      foreignField: "plan_id",
    },
  });

  return new ApiResponse(
    200,
    userPaymentHistory,
    "payment histroy fetched successfully "
  );
});


export const generateInvoice = asyncHandler(async (req: RequestUser, res) => {
  const { paymentId } = req.params;
  if (!paymentId) throw new ApiError("Payment ID is required", 400);

  const payment = await razorpayInstance.payments.fetch(paymentId);
  if (!payment) throw new ApiError("Payment not found", 404);

  // Fetch subscription details if available
  let subscription: any = {};
  if (payment.notes && payment.notes.subscription_id) {

    // console.log("payment.notes.subscription_id", payment.notes.subscription_id);
    const dbSubscription = await Subscriptions.findOne({ subscriptionId: payment.notes.subscription_id }).populate({
      path: "planId",
      populate: { path: "razorpayPlanItem" }
    });
    if (dbSubscription) {
      subscription = { razorpay_subscription_id: dbSubscription };
    } else {
      // Fallback to razorpay fetch if needed, though structure might differ
      subscription = await razorpayInstance.subscriptions.fetch(payment.notes.subscription_id);
    }
  } else if (payment.order_id) {
    // Try to find subscription via order_id or other means if needed.
    // For now, let's assume we can find it via the payment's subscription_id or similar.
    // The user provided example shows a structure where subscription is populated.
    // Let's try to find the subscription associated with this user and payment.

    // In the user provided example:
    // "razorpay_payment_id": "pay_RghtnRk9tTs6r0",
    // "razorpay_subscription_id": { ... }

    // We can search in Payments model
    // We can search in Payments model
    const paymentRecord = await Payments.findOne({ razorpay_payment_id: paymentId });

    // console.log("paymentRecord", paymentRecord);

    if (paymentRecord && paymentRecord.razorpay_subscription_id) {
      const dbSubscription = await Subscriptions.findOne({ subscriptionId: paymentRecord.razorpay_subscription_id }).populate({
        path: "planId",
        foreignField: "plan_id"
      });
      if (dbSubscription) {
        subscription = { razorpay_subscription_id: dbSubscription };
      }
    }
  }

  let user: any = null;
  if (subscription && subscription.razorpay_subscription_id && subscription.razorpay_subscription_id.userId) {
    user = await Users.findById(subscription.razorpay_subscription_id.userId);
  } else if (payment.notes && payment.notes.user_id) {
    user = await Users.findById(payment.notes.user_id);
  }

  const invoiceHtml = InvoiceHTMLTemplate({ payment, subscription, user });

  let browser;
  try {
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    };

    if (process.env.PRODUCTION_PATH_PUPPITER) {
      launchOptions.executablePath = process.env.PRODUCTION_PATH_PUPPITER;
      console.log("path hai = ", process.env.PRODUCTION_PATH_PUPPITER);
    }

    browser = await puppeteer.launch(launchOptions);
  } catch (error) {
    console.error("Failed to launch puppeteer browser:", error);
    throw new ApiError("Failed to generate invoice. Server configuration error: Missing dependencies.", 500);
  }

  try {
    const page = await browser.newPage();
    await page.setContent(invoiceHtml, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice_${paymentId}.pdf`,
      "Content-Length": pdfBuffer.length,
      "Content-Transfer-Encoding": "binary"
    });

    res.end(Buffer.from(pdfBuffer));
  } catch (error) {
    if (browser) await browser.close();
    console.error("Error generating PDF:", error);
    throw new ApiError("Failed to generate PDF", 500);
  }
});


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
