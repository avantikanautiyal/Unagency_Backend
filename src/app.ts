import express from "express";
import cors from "cors";
import mongoose from "mongoose";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import StaffRouter from "./routes/staff.route";
import ProjectRouter from "./routes/project.route";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/categories.route";
import packagesRouter from "./routes/packages.route";
import teamRouter from "./routes/teams.route";
import userRouter from "./routes/users.route";
import OrganizationsRouter from "./routes/organizations.route";
import ChatRouter from "./routes/chat.route";

// middleware
import stripeRouter from "./routes/stripe.route";
import { VerifyUserHandler } from "./middlewares/verifyUser.middleware";
import { asyncHandler } from "./utils/asyncHandler";
import Stripe from "stripe";
import CheckoutSession from "./models/checkoutsession.model";
import { ApiResponse } from "./utils/apiResponse";
import Subscriptions from "./models/subscription.model";
const app = express();

//Use of CORS
app.use(cors());
const StripeWebhook = asyncHandler(async (req, res) => {
  const sigHeader = req.headers["stripe-signature"] as string;
  const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
    apiVersion: "2024-06-20", // Ensure you specify the latest API version
  });
  let event;
  event = await stripe.webhooks.constructEventAsync(
    req.body,
    sigHeader,
    "REDACTED"
  );
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log(session.payment_intent);
    await CheckoutSession.create({
      sessionId: session.id,
      customerId: session.customer,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    });

    return new ApiResponse(200, null, "Payment Session Saved Successfully");
  }
  if (event.type === "customer.subscription.created") {
    const subscription = event.data.object;
    console.log(subscription);
    await Subscriptions.create({
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      planId: subscription.items.data[0].plan.id, // Plan ID (assuming single plan for simplicity)
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000), // Convert to JS Date
      currentPeriodEnd: new Date(subscription.current_period_end * 1000), // Convert to JS Date
    });
    return new ApiResponse(200, null, "Subscription saved Successfully");
  }
  if (event.type === "invoice.paid") {

    console.log(event.data.object);
    return new ApiResponse(200, null, "Invoice updated Successfully");
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
    return new ApiResponse(200, null, "Subscription updated Successfully");
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    await Subscriptions.findOneAndUpdate(
      { subscriptionId: subscription.id },
      { status: "canceled" }
    );
    return new ApiResponse(200, null, "Subscription canceled");
  }
});

//Use of Express JSON CONFIG
app.use("/webhook", express.raw({ type: "application/json" }), StripeWebhook);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

type CustomExpress = {
  run: () => void;
} & typeof app;

//routes declaration
app.use("/auth", authRouter);
app.use("/users", userRouter);
app.use("/projects", ProjectRouter);
app.use("/staff", StaffRouter);
app.use("/stripe", stripeRouter);
app.use("/packages", packagesRouter);
app.use("/categories", categoryRouter);
app.use("/organizations", VerifyUserHandler, OrganizationsRouter);
app.use("/teams", VerifyUserHandler, teamRouter);
app.use("/", helloWorldRouter);
app.use("/chat", VerifyUserHandler, ChatRouter);

// Invalid Path Error Handler
app.use(RouteErrorHandler);
// Error handler MiddleWare
app.use(ErrorHandler);

(app as CustomExpress).run = async () => {
  try {
    mongoose.connect(process.env.DB_URI!);
    mongoose.connection.on("connected", () => {
      console.log("DB_CONNECTED");
    });
    app.listen(process.env.PORT ?? 5000, () => {
      console.log(
        "⚙️",
        ` Server is running at port : ${process.env.PORT ?? 5000}`
      );
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
