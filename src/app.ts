import express from "express";
import cors from "cors";
import mongoose from "mongoose";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import StaffRouter from "./routes/staff.route";
import SubscriptionRouter from "./routes/subscription.route";
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
import Invoices from "./models/invoices.model";
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

  let invoice;
  let existingInvoice;
  let status;
  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      await CheckoutSession.create({
        sessionId: session.id,
        customerId: session.customer,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
      });
      console.log("Checkout session completed");
      break;
    case "customer.subscription.created":
      await Subscriptions.create({
        subscriptionId: event.data.object?.id,
        customerId: event.data.object?.customer,
        planId: event.data.object?.items.data[0].plan.id,
        status: event.data.object?.status,
        currentPeriodStart: new Date(
          event.data.object?.current_period_start * 1000
        ),
        currentPeriodEnd: new Date(
          event.data.object?.current_period_end * 1000
        ),
      });
      status = event.data.object.status;
      console.log("Customer subscription initiated");
      break;
    case "customer.subscription.updated":
      await Subscriptions.findOneAndUpdate(
        { subscriptionId: event.data.object.id },
        {
          status: event.data.object.status,
          planId: event.data.object.items.data[0].plan.id, // Updated Plan ID
          currentPeriodStart: new Date(
            event.data.object.current_period_start * 1000
          ),
          currentPeriodEnd: new Date(
            event.data.object.current_period_end * 1000
          ),
        },
        { new: true }
      );
      status = event.data.object.status;
      console.log("Customer subscription updated");
      break;
    case "customer.subscription.deleted":
      await Subscriptions.findOneAndUpdate(
        { subscriptionId: event.data.object.id },
        { status: "canceled" }
      );
      status = event.data.object.status;
      console.log("Customer subscription canceled");
      break;
    case "invoice.paid":
      invoice = event.data.object;
      const customerId = invoice.customer as string; // Get customer ID
      const paymentIntentId = invoice.payment_intent; // Get payment intent ID
      if (paymentIntentId !== null) {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          paymentIntentId as string
        );
        const paymentMethodId: string = paymentIntent?.payment_method as string; // Get payment method ID from payment intent
        if (invoice?.default_payment_method == null) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
          });
          await stripe.customers.update(customerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          });
          console.log(
            `Payment method ${paymentMethodId} attached to customer ${customerId}.`
          );
        }
      }

      await Invoices.create({
        invoiceId: invoice.id,
        subscriptionId: invoice.subscription,
        customerId: invoice.customer,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        status: "paid",
        paymentDate: new Date(invoice.created * 1000), // Convert timestamp to JS Date
      });
      console.log(invoice.default_payment_method, "invoice paid");
      break;
    case "invoice.payment_failed":
      invoice = event.data.object;
      if (invoice.charge !== null) {
        await Invoices.create({
          invoiceId: invoice.id,
          subscriptionId: invoice.subscription,
          customerId: invoice.customer,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
          status: "failed",
          failureMessage: "Payment failed without a specific message",
          failedPaymentDate: new Date(invoice.created * 1000), // Convert timestamp to JS Date
        });
      }
      console.log(invoice, "invoice payment failed");
      break;
    default:
      null;
  }
  res.sendStatus(200);
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
app.use("/subscription", SubscriptionRouter);
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
