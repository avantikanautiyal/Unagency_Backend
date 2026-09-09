import mongoose from "mongoose";
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
import {
  buildDemoRazorpayPayment,
  buildDemoRazorpaySubscription,
  isDemoPaymentId,
  isDemoSeedEnabled,
  isDemoSubscriptionId,
} from "../utils/demoSeed";
import {
  getPublicRazorpayKeyId,
  resolveActivePlanFromCode,
  subscriptionTotalCount,
} from "../billing/plan-resolver";
import { listCanonicalPlans } from "../billing/plan-catalog";
import { syncCanonicalPlansToDatabase } from "../billing/sync-canonical-plans";
import { getCurrentCreditBalance } from "../billing/credit-service";
import {
  getActivePlan,
  syncEntitlementStatusFromRazorpay,
} from "../billing/entitlement-service";
import { isPlanCode } from "../billing/plan-codes";

function safeRazorpayError(error: unknown): string {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : "";
  // Prefer actionable Razorpay descriptions without dumping secrets
  const description =
    error &&
    typeof error === "object" &&
    "error" in error &&
    (error as { error?: { description?: string } }).error?.description
      ? String((error as { error?: { description?: string } }).error?.description)
      : "";
  const combined = `${description} ${msg}`.trim();
  if (/authentication|key|secret/i.test(combined)) {
    return "Payment provider authentication failed. Check Razorpay Test keys.";
  }
  if (/plan/i.test(combined)) {
    return "Selected plan is unavailable in Razorpay. Verify plan IDs in env.";
  }
  if (combined.length > 0 && combined.length < 180) {
    return combined;
  }
  return "Unable to create subscription. Please try again.";
}

/**
 * POST /razorpay/subscriptions/create
 * Body: { planCode: "UNAGENCY_HYBRID_MONTHLY" }
 * Frontend must NOT send amount, currency, or Razorpay plan IDs.
 */
export const buySubscription = asyncHandler(async (req: RequestUser) => {
  const planCodeRaw = req.body?.planCode ?? req.body?.plan_code;
  // Reject legacy clients that send arbitrary Razorpay plan IDs
  if (req.body?.plan_id || req.body?.planId) {
    throw new ApiError(
      "Send planCode only. Razorpay plan IDs are resolved server-side.",
      400
    );
  }
  if (!planCodeRaw) throw new ApiError("planCode is required", 400);

  const { planCode, definition, razorpayPlanId } =
    resolveActivePlanFromCode(planCodeRaw);

  const user = await Users.findById(req.user?.userId);
  if (!user) throw new ApiError("User not found", 404);

  const existingStatus = String(user?.subscription?.status ?? "");
  const existingSubId = user?.subscription?.id;

  // Resume incomplete checkout instead of blocking the Select button
  if (existingSubId && ["created", "authenticated"].includes(existingStatus)) {
    const local = await Subscriptions.findOne({ subscriptionId: existingSubId });
    const samePlan =
      local?.planCode === planCode || local?.planId === razorpayPlanId;
    if (samePlan) {
      let shortUrl: string | undefined;
      let status = existingStatus;
      try {
        const fetched = await razorpayInstance.subscriptions.fetch(existingSubId);
        shortUrl = (fetched as { short_url?: string }).short_url;
        status = String(fetched.status ?? existingStatus);
      } catch {
        /* return local row even if Razorpay fetch fails */
      }
      return new ApiResponse(
        200,
        {
          subscriptionId: existingSubId,
          status,
          planCode,
          planName: definition.name,
          amountInr: definition.amountInr,
          currency: definition.currency,
          billingPeriod: definition.billingPeriod,
          razorpayKeyId: getPublicRazorpayKeyId(),
          shortUrl,
          resumed: true,
        },
        "Resuming existing Razorpay subscription checkout"
      );
    }
  }

  if (
    existingSubId &&
    ["pending", "active"].includes(existingStatus)
  ) {
    throw new ApiError(
      "Please cancel your current subscription before choosing a new plan",
      400
    );
  }

  // Clear a stranded created/authenticated sub for a different plan so Select works
  if (existingSubId && ["created", "authenticated"].includes(existingStatus)) {
    try {
      await razorpayInstance.subscriptions.cancel(existingSubId, false);
    } catch {
      /* ignore — may already be cancelled */
    }
    await Subscriptions.findOneAndUpdate(
      { subscriptionId: existingSubId },
      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
          razorpayCancelRequested: true,
        },
      }
    );
    await Users.findByIdAndUpdate(req.user?.userId, {
      $set: { subscription: {} },
    });
  }

  // Ensure local plan row exists (never creates Razorpay plans)
  await PlansModel.findOneAndUpdate(
    { plan_id: razorpayPlanId },
    {
      $setOnInsert: {
        plan_id: razorpayPlanId,
        tag:
          definition.mode === "AI"
            ? "ai"
            : definition.mode === "HYBRID"
              ? "hybrid"
              : "human",
        occurance:
          definition.billingPeriod === "annual" ? "yearly" : "monthly",
        razorpayPlanItem: {
          id: razorpayPlanId,
          entity: "plan",
          interval: 1,
          period: definition.billingPeriod === "annual" ? "yearly" : "monthly",
          item: {
            id: `item_${razorpayPlanId}`,
            active: true,
            name: definition.name,
            description: definition.name,
            amount: definition.amountPaise,
            unit_amount: definition.amountPaise,
            currency: "INR",
            type: "plan",
          },
        },
      },
      $set: {
        planCode,
        mode: definition.mode,
        billingPeriod: definition.billingPeriod,
        entitlements: definition.entitlements,
        active: true,
      },
    },
    { upsert: true, new: true }
  );

  const orgId =
    (user as { organization?: { _id?: { toString(): string } } }).organization
      ?._id?.toString() || undefined;

  let subscription: {
    id: string;
    plan_id: string;
    status: string;
    current_start?: number | null;
    current_end?: number | null;
    quantity?: number;
    total_count?: number;
    paid_count?: number;
    remaining_count?: number;
    customer_id?: string;
    short_url?: string;
  };

  try {
    subscription = await razorpayInstance.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      quantity: 1,
      total_count: subscriptionTotalCount(definition.billingPeriod),
      notes: {
        planCode,
        userId: String(req.user?.userId),
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });
  } catch (error) {
    console.error("error creating subscription");
    throw new ApiError(safeRazorpayError(error), 400);
  }

  const createUserSubscription = await Subscriptions.create({
    subscriptionId: subscription.id,
    userId: req.user?.userId,
    organizationId: orgId,
    planId: razorpayPlanId,
    planCode,
    status: subscription.status || "created",
    current_start: subscription.current_start ?? null,
    current_end: subscription.current_end ?? null,
    quantity: subscription.quantity ?? 1,
    total_count: subscription.total_count,
    paid_count: subscription.paid_count,
    remaining_count: subscription.remaining_count,
    customerId: subscription.customer_id,
  });

  await Users.findByIdAndUpdate(req.user?.userId, {
    $set: {
      "subscription.id": subscription.id,
      "subscription.status": subscription.status || "created",
    },
  });

  return new ApiResponse(
    200,
    {
      subscriptionId: createUserSubscription.subscriptionId,
      status: createUserSubscription.status,
      planCode,
      planName: definition.name,
      amountInr: definition.amountInr,
      currency: definition.currency,
      billingPeriod: definition.billingPeriod,
      razorpayKeyId: getPublicRazorpayKeyId(),
      shortUrl: subscription.short_url,
      // Keep local record fields for backward-compatible clients
      ...createUserSubscription.toObject(),
    },
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
      status: razrerSubscription.status,
      razorpayCancelRequested: true,
      cancelledByUser: true,
      cancelledAt: new Date(),
    },
    { new: true }
  );

  return new ApiResponse(200, subs, "subscription Canceled");

});

export const updateSubscription = asyncHandler(async (req: RequestUser) => {
  const planCodeRaw = req.body?.planCode ?? req.body?.plan_code;
  if (req.body?.plan_id || req.body?.planId) {
    throw new ApiError(
      "Send planCode only. Razorpay plan IDs are resolved server-side.",
      400
    );
  }
  if (!planCodeRaw) throw new ApiError("planCode is required", 400);

  const { planCode, razorpayPlanId } = resolveActivePlanFromCode(planCodeRaw);
  const userId = req.user?.userId;

  const user = await Users.findById(userId);

  if (!user?.subscription?.id) {
    throw new ApiError("No active subscription found to update. Please buy a subscription first.", 400);
  }

  var currentSubscription: any;
  try {
    currentSubscription = await razorpayInstance.subscriptions.fetch(user.subscription.id);
  } catch {
    throw new ApiError("Unable to fetch current subscription", 400);
  }

  if (currentSubscription.status === "cancelled" || currentSubscription.status === "expired") {
    throw new ApiError("Cannot update a cancelled or expired subscription. Please buy a new one.", 400);
  }

  if (currentSubscription.plan_id === razorpayPlanId) {
    throw new ApiError("New plan is the same as the current plan. No update needed.", 400);
  }

  // Schedule immediate plan change on Razorpay — local entitlements update via webhook.
  const updatedSubscription = await razorpayInstance.subscriptions.update(user.subscription.id, {
    plan_id: razorpayPlanId,
    schedule_change_at: "now",
  });

  await Subscriptions.findOneAndUpdate(
    { subscriptionId: user.subscription.id },
    { $set: { planId: razorpayPlanId, planCode } }
  );

  return new ApiResponse(
    200,
    {
      subscriptionId: updatedSubscription.id,
      status: updatedSubscription.status,
      planCode,
      razorpayPlanId,
    },
    "Subscription update initiated successfully"
  );
});

export const cancelUpdateSubscription = asyncHandler(async (req: RequestUser) => {
  const userId = req.user?.userId;
  const user = await Users.findById(userId);

  if (!user?.subscription?.id) {
    throw new ApiError("No active subscription found", 400);
  }

  try {
    // Razorpay SDK method to cancel scheduled variations/updates
    const result = await razorpayInstance.subscriptions.cancelScheduledChanges(user.subscription.id);

    return new ApiResponse(
      200,
      result,
      "Scheduled subscription update has been cancelled"
    );
  } catch (error: any) {
    throw new ApiError(error.message || "Failed to cancel scheduled update. There might be no scheduled update pending.", 400);
  }
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
    // console.log("razerpSubscription before ");
    var razerpSubscription: any = null;
    if (!req.user?.subscription?.id) return new ApiResponse(200, null, "No subscription found no subscription id ");

    const subscriptionId = req.user.subscription.id;
    if (isDemoSeedEnabled() && isDemoSubscriptionId(subscriptionId)) {
      const dbSubscription = await Subscriptions.findOne({ subscriptionId }).populate({
        path: "planId",
        foreignField: "plan_id",
      });
      razerpSubscription = buildDemoRazorpaySubscription(
        subscriptionId,
        dbSubscription?.planId || "plan_demo_gold_monthly",
        req.user?.email
      );
    } else {
      try {
        razerpSubscription = await razorpayInstance.subscriptions.fetch(subscriptionId);
      } catch (error) {
        console.log("error ", error);
        throw new ApiError("error fetching subscription " + (error as any).message, 200);
      }
    }
    if (razerpSubscription.current_end && (razerpSubscription.current_end * 1000) < Date.now()) {
      console.log("subscription expired ", userId, razerpSubscription.current_end * 1000, Date.now());
      await Users.findByIdAndUpdate(userId, {
        $set: {
          subscription: {}
        }
      });
      return new ApiResponse(200, null, "Subscription expired");
    }

    // Align local entitlement status with Razorpay — badge used live status while
    // brand limits read Users/Subscriptions (often stuck at "created" after mobile checkout).
    await syncEntitlementStatusFromRazorpay({
      userId,
      subscriptionId,
      razorpayStatus: String(razerpSubscription.status ?? ""),
    });

    const subscription = await Subscriptions.findOne({
      subscriptionId: req.user?.subscription?.id,
    }).populate({ path: "planId", foreignField: "plan_id" });

    const curSubsc = {
      ...(subscription?.toObject()), status: razerpSubscription.status,

      email: razerpSubscription?.customer_email!,
      contact: razerpSubscription?.customer_contact!,
      payment_method: razerpSubscription?.payment_method!,
      remaining_count: razerpSubscription?.remaining_count!,
      total_count: razerpSubscription?.total_count!,
    };

    const activePlan = await getActivePlan(userId);
    const credits = await getCurrentCreditBalance(userId);

    return new ApiResponse(
      200,
      {
        ...curSubsc,
        planCode: subscription?.planCode ?? activePlan?.planCode,
        entitlements: activePlan?.entitlements ?? null,
        credits: credits
          ? {
              allocated: credits.allocated,
              used: credits.used,
              remaining: credits.remaining,
              periodStart: credits.periodStart,
              periodEnd: credits.periodEnd,
            }
          : null,
      },
      "All subscriptions"
    );
  }
);
// route for the service , admin
export const getCustomerCurrentSubscription = asyncHandler(
  async (req: RequestUser) => {
    const userId = req.params?.userId;
    if (!userId) throw new ApiError("UserId not present", 400);

    const user = await Users.findById(userId);

    var razerpSubscription: any = null;
    if (!user?.subscription?.id) return new ApiResponse(200, null, "No subscription found no subscription id ");
    try {
      razerpSubscription = await razorpayInstance.subscriptions.fetch(user?.subscription?.id!);
      // razerpSubscription = await razorpayInstance.subscriptions.fetch("sub_RkiCnTgakoK6gh");

    } catch (error) {
      console.log("error ", error);
      throw new ApiError("error fetching subscription " + (error as any).message, 200);
    }

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
      res.redirect(process.env.FRONTEND_URL + "/payment-failure?payment_id=" + razorpay_payment_id + "&subscription_id=" + razorpay_subscription_id);

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
  async (req: RequestUser) => {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    if (
      !razorpay_payment_id ||
      !razorpay_subscription_id ||
      !razorpay_signature
    ) {
      throw new ApiError("Payment verification payload incomplete", 400);
    }

    const secret =
      process.env.RAZORPAY_SECRET?.trim() ||
      process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!secret) throw new ApiError("Payment verification unavailable", 500);

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`, "utf-8")
      .digest("hex");

    let isValidSignature = false;
    try {
      isValidSignature = crypto.timingSafeEqual(
        Buffer.from(generated_signature, "utf8"),
        Buffer.from(String(razorpay_signature), "utf8")
      );
    } catch {
      isValidSignature = false;
    }
    if (!isValidSignature) {
      throw new ApiError("Invalid payment signature", 400);
    }

    const subs = await Subscriptions.findOne({
      subscriptionId: razorpay_subscription_id,
    });
    if (!subs) throw new ApiError("Subscription not found", 404);

    const existingPayment = await Payments.findOne({ razorpay_payment_id });
    if (!existingPayment) {
      await Payments.create({
        razorpay_payment_id,
        razorpay_subscription_id,
        razorpay_signature,
        userId: subs.userId,
        status: "authorized",
      });
    }

    // Checkout success is not sole authority — mark authenticated; webhook activates + credits
    if (!["active", "completed"].includes(String(subs.status))) {
      await Subscriptions.findOneAndUpdate(
        { subscriptionId: razorpay_subscription_id },
        { $set: { status: "authenticated" } }
      );
      await Users.findByIdAndUpdate(subs.userId, {
        $set: {
          "subscription.id": razorpay_subscription_id,
          "subscription.status": "authenticated",
        },
      });
    }

    return new ApiResponse(
      200,
      {
        verified: true,
        subscriptionId: razorpay_subscription_id,
        paymentId: razorpay_payment_id,
        planCode: subs.planCode,
        status: "authenticated",
        note: "Webhook remains authoritative for activation and credit allocation",
      },
      "Payment signature verified"
    );
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

  let payment: any;
  if (isDemoSeedEnabled() && isDemoPaymentId(paymentId)) {
    const paymentRecord = await Payments.findOne({ razorpay_payment_id: paymentId });
    const user = paymentRecord?.userId
      ? await Users.findById(paymentRecord.userId)
      : await Users.findById(req.user?.userId);
    payment = buildDemoRazorpayPayment(
      paymentId,
      499900,
      user?.email || "demo@unagency.test",
      paymentRecord?.razorpay_subscription_id
    );
  } else {
    payment = await razorpayInstance.payments.fetch(paymentId);
    if (!payment) throw new ApiError("Payment not found", 404);
  }

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
  const userIdentifier = (subscription?.razorpay_subscription_id?.userId) || (payment.notes && payment.notes.user_id);

  if (userIdentifier) {
    if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
      user = await Users.findById(userIdentifier);
    } else {
      user = await Users.findOne({ email: userIdentifier });
    }
  }

  const invoiceHtml = InvoiceHTMLTemplate({ payment, subscription, user });

  let browser;
  try {
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox'
      ]
    };
    if (process.env.PRODUCTION_PATH_PUPPITER) {
      launchOptions.executablePath = process.env.PRODUCTION_PATH_PUPPITER;
    }
    console.log("path hai = ", launchOptions);

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
  const billingPeriod =
    req.query?.billingPeriod === "annual" || req.query?.period === "annual"
      ? "annual"
      : req.query?.billingPeriod === "monthly" || req.query?.period === "monthly"
        ? "monthly"
        : undefined;

  // Prefer catalog-backed plans; sync local rows if empty
  let plans = await PlansModel.find({
    planCode: { $exists: true, $ne: null },
    active: { $ne: false },
    ...(billingPeriod ? { billingPeriod } : {}),
  }).lean();

  if (plans.length === 0) {
    try {
      await syncCanonicalPlansToDatabase();
      plans = await PlansModel.find({
        planCode: { $exists: true, $ne: null },
        active: { $ne: false },
        ...(billingPeriod ? { billingPeriod } : {}),
      }).lean();
    } catch (err) {
      console.error("canonical plan sync skipped", err);
      // Fall back to in-memory catalog for display (no secrets)
      const catalog = listCanonicalPlans(billingPeriod).map((p) => ({
        plan_id: `pending_${p.planCode}`,
        planCode: p.planCode,
        mode: p.mode,
        billingPeriod: p.billingPeriod,
        entitlements: p.entitlements,
        active: p.active,
        tag: p.mode.toLowerCase(),
        occurance: p.billingPeriod === "annual" ? "yearly" : "monthly",
        razorpayPlanItem: {
          id: `pending_${p.planCode}`,
          period: p.billingPeriod === "annual" ? "yearly" : "monthly",
          item: {
            name: p.name,
            amount: p.amountPaise,
            currency: p.currency,
          },
        },
        points: [],
      }));
      return new ApiResponse(200, catalog, "Canonical plans (awaiting env sync)");
    }
  }

  return new ApiResponse(200, plans, "RazorPay Plans fetched successfully");
});

/** Admin utility: attach metadata to an EXISTING Razorpay plan — does not create Razorpay plans. */
export const createRazorPayPlan = asyncHandler(async (req: RequestUser) => {
  const { plan_id, planCode, ...rest } = req.body;

  if (planCode && isPlanCode(planCode)) {
    const result = await syncCanonicalPlansToDatabase();
    const plan = await PlansModel.findOne({ planCode });
    return new ApiResponse(
      200,
      { plan, synced: result.upserted },
      "Canonical plans synced (existing Razorpay plan IDs only)"
    );
  }

  if (!plan_id) throw new ApiError("Plan ID or planCode is required", 400);

  const plan = await razorpayInstance.plans.fetch(plan_id);

  const newPlan = await PlansModel.create({
    plan_id: plan_id,
    razorpayPlanItem: plan,
    ...rest,
  });
  return new ApiResponse(200, newPlan, "RazorPay Plan linked successfully");
});
export const deleteRazorPayPlan = asyncHandler(async (req: RequestUser) => {
  const { plan_id } = req.params;

  if (!plan_id) throw new ApiError("Plan ID is required", 400);

  const plan = await PlansModel.findOneAndDelete({ plan_id: plan_id });
  return new ApiResponse(200, plan, "RazorPay Plan deleted successfully");
});
export const updateRazorPayPlan = asyncHandler(async (req: RequestUser) => {
  const { plan_id } = req.params;

  if (!plan_id) throw new ApiError("Plan ID is required", 400);

  const plan = await razorpayInstance.plans.fetch(plan_id);

  const updatedPlan = await PlansModel.findOneAndUpdate(
    { plan_id },
    {
      $set: {
        razorpayPlanItem: plan,
        ...req.body
      }
    },
    { new: true, runValidators: true }
  );

  return new ApiResponse(200, updatedPlan, "RazorPay Plan updated successfully");
});

