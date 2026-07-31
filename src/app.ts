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
import RequirementRouter from "./routes/requirement.route";
import TaskRouter from "./routes/tasks.route";
import NotificationRouter from "./routes/notification.route"
import planRouter from "./routes/plan.routes";
import productAssetsRouter from "./routes/product-assets.route";
// Legacy BullMQ/cron workers — started explicitly in app.run() (M9.4A)
// Do NOT import queue modules at top-level (leaves open handles in tests).

// middleware
import {
  IsVerifiedUser,
  VerifyUserHandler,
} from "./middlewares/verifyUser.middleware";
import razorpayRouter from "./routes/razorpay.route";
import { razorpayWebhook } from "./webhook/razorpaywebhook";
import dashboardRoute from "./routes/dashboard.route";
import {
  bootstrapEnterpriseApiRuntime,
  bootstrapEnterpriseApiRuntimeAsync,
  logEnterpriseApiMount,
  parseEnterpriseApiExecutionModeFromEnv,
  validateEnterpriseApiExecutionConfig,
} from "./platform/api/runtime";
import { createExpressPlatformAdapter } from "./platform/api/transports/express";
import type { EnterpriseApiRuntime } from "./platform/api/runtime";
import { closeSharedRedisClient } from "./platform/infrastructure/durability";

const app = express();

//Use of CORS
app.use(cors());

// const StripeWebhook = asyncHandler(async (req, res) => {
//   const sigHeader = req.headers["stripe-signature"] as string;
//   const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
//     apiVersion: "2024-06-20", // Ensure you specify the latest API version
//   });
//   let event;
//   event = await stripe.webhooks.constructEventAsync(
//     req.body,
//     sigHeader,
//     process.env.stripe_webhook_endpoint_secret
//   );

//   let invoice;
//   let status;
//   switch (event.type) {
//     case "checkout.session.completed":
//       const session = event.data.object;
//       await CheckoutSession.create({
//         sessionId: session.id,
//         customerId: session.customer,
//         paymentStatus: session.payment_status,
//         amountTotal: session.amount_total,
//         currency: session.currency,
//       });
//       console.log("Checkout session completed");
//       break;
//     case "customer.subscription.created":
//       await Subscriptions.create({
//         subscriptionId: event.data.object?.id,
//         customerId: event.data.object?.customer,
//         planId: event.data.object?.items.data[0].plan.id,
//         status: event.data.object?.status,
//         currentPeriodStart: new Date(
//           event.data.object?.current_period_start * 1000
//         ),
//         currentPeriodEnd: new Date(
//           event.data.object?.current_period_end * 1000
//         ),
//       });
//       status = event.data.object.status;
//       const customer = await StripeCustomers.findOne({
//         stripeCustomerId: event.data.object?.customer,
//       });
//       const email = customer?.email;
//       const name = customer?.name;
//       const planName = event.data.object?.items?.data[0]?.plan?.nickname;
//       const amount = event.data.object?.items?.data[0]?.plan?.amount;
//       const currency = event.data.object?.items?.data[0]?.plan?.currency;
//       const interval = event.data.object?.items?.data[0]?.plan?.interval;
//       const current_period_start = event.data.object?.current_period_start;
//       const current_period_end = event.data.object?.current_period_end;

//       // await EmailQueue.add("membership taken", {
//       //   action: "SUBSCRIPTION",
//       //   data: {
//       //     email: email,
//       //     customerName: name,
//       //     planName: planName,
//       //     startDate: current_period_start,
//       //     nextRenualDate: current_period_end,
//       //     BillingCycle: interval,
//       //     price: `${currency} ${amount}`
//       //   },
//       //   notification: new Notification(planName as string, "", "COMMON") as any,
//       // })
//       console.log("Customer subscription initiated");
//       break;
//     case "customer.subscription.updated":
//       await Subscriptions.findOneAndUpdate(
//         { subscriptionId: event.data.object.id },
//         {
//           status: event.data.object.status,
//           planId: event.data.object.items.data[0].plan.id, // Updated Plan ID
//           currentPeriodStart: new Date(
//             event.data.object.current_period_start * 1000
//           ),
//           currentPeriodEnd: new Date(
//             event.data.object.current_period_end * 1000
//           ),
//         },
//         { new: true }
//       );
//       status = event.data.object.status;

//       console.log("Customer subscription updated");
//       break;
//     case "customer.subscription.deleted":
//       await Subscriptions.findOneAndUpdate(
//         { subscriptionId: event.data.object.id },
//         { status: "canceled" }
//       );
//       status = event.data.object.status;
//       console.log("Customer subscription canceled");
//       break;
//     case "invoice.paid":
//       invoice = event.data.object;
//       const customerId = invoice.customer || null; // Get the customer ID
//       const paymentIntentId = invoice.payment_intent; // Get the payment method used

//       //Making Payment Default Method by Payment Intent Id
//       if (paymentIntentId !== null) {
//         const paymentIntent = await stripe.paymentIntents.retrieve(
//           paymentIntentId as string
//         );
//         const paymentMethodId: string = paymentIntent?.payment_method as string; // Get payment method ID from payment intent
//         await stripe.customers.update(customerId as string, {
//           invoice_settings: {
//             default_payment_method: paymentMethodId,
//           },
//         });
//       }

//       await Invoices.create({
//         invoiceId: invoice.id,
//         subscriptionId: invoice.subscription,
//         customerId: invoice.customer,
//         amountDue: invoice.amount_due,
//         amountPaid: invoice.amount_paid,
//         currency: invoice.currency,
//         status: "paid",
//         paymentDate: new Date(invoice.created * 1000), // Convert timestamp to JS Date
//       });
//       console.log(invoice.default_payment_method, "invoice paid");
//       break;
//     case "invoice.payment_failed":
//       invoice = event.data.object;
//       if (invoice.charge !== null) {
//         await Invoices.create({
//           invoiceId: invoice.id,
//           subscriptionId: invoice.subscription,
//           customerId: invoice.customer,
//           amountDue: invoice.amount_due,
//           currency: invoice.currency,
//           status: "failed",
//           failureMessage: "Payment failed without a specific message",
//           failedPaymentDate: new Date(invoice.created * 1000), // Convert timestamp to JS Date
//         });
//       }
//       console.log(invoice, "invoice payment failed");
//       break;
//     default:
//       null;
//   }
//   res.sendStatus(200);
// });

//Use of Express JSON CONFIG
// app.use("/webhook", express.raw({ type: "application/json" }), StripeWebhook);
app.use("/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook)
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

const enterpriseExecutionMode = parseEnterpriseApiExecutionModeFromEnv();
validateEnterpriseApiExecutionConfig(enterpriseExecutionMode);

let enterpriseApiRuntime: EnterpriseApiRuntime;

if (enterpriseExecutionMode !== "live") {
  enterpriseApiRuntime = bootstrapEnterpriseApiRuntime({
    executionMode: enterpriseExecutionMode,
  });
  app.use(
    createExpressPlatformAdapter({ gateway: enterpriseApiRuntime.platform.gateway })
  );
}

type CustomExpress = {
  run: () => Promise<void>;
} & typeof app;

//routes declaration
app.use("/auth", authRouter);
app.use("/dashboard", VerifyUserHandler, dashboardRoute)
app.use("/categories", VerifyUserHandler, categoryRouter);
app.use("/users", VerifyUserHandler, userRouter);
app.use("/organizations", VerifyUserHandler, OrganizationsRouter);
app.use("/teams", VerifyUserHandler, teamRouter);
app.use("/requirement", VerifyUserHandler, RequirementRouter);
app.use("/staff", VerifyUserHandler, StaffRouter);
app.use("/chat", VerifyUserHandler, ChatRouter);
app.use("/projects", VerifyUserHandler, ProjectRouter);
app.use("/packages", VerifyUserHandler, packagesRouter);
app.use("/tasks", VerifyUserHandler, TaskRouter);
app.use("/subscription", VerifyUserHandler, SubscriptionRouter);
app.use("/plans", VerifyUserHandler, planRouter);
app.use("/assets", VerifyUserHandler, productAssetsRouter);

app.use("/notification", NotificationRouter);

app.use("/razorpay", razorpayRouter);

app.use("/", helloWorldRouter);

// Invalid Path Error Handler
app.use(RouteErrorHandler);
// Error handler MiddleWare
app.use(ErrorHandler);

(app as CustomExpress).run = async () => {
  try {
    if (enterpriseExecutionMode === "live") {
      enterpriseApiRuntime = await bootstrapEnterpriseApiRuntimeAsync();
      app.use(
        createExpressPlatformAdapter({ gateway: enterpriseApiRuntime.platform.gateway })
      );
    }

    logEnterpriseApiMount(
      enterpriseApiRuntime.executionMode,
      enterpriseApiRuntime.firebaseBridgeEnabled,
      enterpriseApiRuntime.configuredProviders
    );
    mongoose.connect(process.env.DB_URI!);
    mongoose.connection.on("connected", () => {
      console.log("DB_CONNECTED");
    });

    // Explicit legacy background worker lifecycle (not import side-effect)
    if (process.env.ENTERPRISE_API_START_LEGACY_WORKERS !== "false") {
      await import("./background/queue/taskDeadline.queue");
      await import("./background/queue/notificationCron.queue");
    }

    const server = app.listen(process.env.PORT ?? 4000, () => {
      console.log(
        "⚙️",
        ` Server is running at port : ${process.env.PORT ?? 4000}`
      );
    });

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`⚙️  Received ${signal}, shutting down gracefully`);
      server.close(() => {
        void (async () => {
          try {
            // M9.5O1 — drain/abort in-flight native streams before stores close.
            try {
              const { getActiveStreamRegistry, loadStreamingRuntimeConfig } =
                await import(
                  "./platform/intelligence/providers/streaming"
                );
              const cfg = loadStreamingRuntimeConfig(process.env);
              await getActiveStreamRegistry().shutdown({
                drainMs: cfg.shutdownDrainMs,
                reason: "server_shutdown",
              });
            } catch {
              /* streaming registry optional if module unload fails */
            }
            await enterpriseApiRuntime?.platform.distributed.shutdown();
            await closeSharedRedisClient();
            await mongoose.connection.close();
          } finally {
            process.exit(0);
          }
        })();
      });
      setTimeout(() => process.exit(1), 15_000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
