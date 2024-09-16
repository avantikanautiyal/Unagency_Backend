import express from "express";
import cors from "cors";

//Global Error Handler
import { ErrorHandler } from "./middlewares/errorHandler.middleware";
import { RouteErrorHandler } from "./middlewares/routeErrorHandler.middleware";

// routs import
import helloWorldRouter from "./routes/hello.route";
import authRouter from "./routes/auth.route";
import categoryRouter from "./routes/categories.route";
import packagesRouter from "./routes/packages.route";
import teamRouter from "./routes/teams.route";
import OrganizationsRouter from "./routes/organizations.route";
import stripeRouter from "./routes/stripe.route";
import mongoose from "mongoose";
import { VerifyUserHandler } from "./middlewares/verifyUser.middleware";
import { asyncHandler } from "./utils/asyncHandler";
import Stripe from "stripe";
import CheckoutSession from "./models/checkoutsession.model";
const app = express();

//Use of CORS
app.use(cors());

const StripeWebhook = asyncHandler(async (req, res) => {
  const sigHeader = req.headers["stripe-signature"] as string;
  const stripe = new Stripe(`${process.env.stripe_secret_key}`);
  let event;
  event = await stripe.webhooks.constructEventAsync(
    req.body,
    sigHeader,
    "REDACTED"
  );
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await CheckoutSession.create({
      sessionId: session.id,
      customerId: session.customer,
      paymentStatus: session.payment_status,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
    console.log("Payment session saved successfully");
  }
});

//Use of Express JSON CONFIG
app.use(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  StripeWebhook
);
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true }));

type CustomExpress = {
  run: () => void;
} & typeof app;

//routes declaration
app.use("/auth", authRouter);
app.use("/stripe", stripeRouter);
app.use("/packages", packagesRouter);
app.use("/categories", categoryRouter);
app.use("/organizations", VerifyUserHandler, OrganizationsRouter);
app.use("/teams", VerifyUserHandler, teamRouter);
app.use("/", helloWorldRouter);

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
    app.listen(process.env.PORT ?? 6000, () => {
      console.log(
        "⚙️",
        ` Server is running at port : ${process.env.PORT ?? 6000}`
      );
    });
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
};

export default app as CustomExpress;
