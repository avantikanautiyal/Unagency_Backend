import { Request, Response } from "express";
import Subscriptions from "../models/subscription.model";
import PaymentModel from "../models/payment.model";
import crypto from "crypto";
import Users from "../models/users.model";

const webhookSecret = "123456654321";
export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    console.log("webhook called....");
    const signature = req.headers["x-razorpay-signature"];
    
    // req.body is a Buffer when using express.raw()
    const rawBody = req.body as Buffer;
    const bodyString = rawBody.toString("utf8");
    
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyString)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid Razorpay webhook signature");
      return res.status(400).send("Invalid signature");
    }

    console.log("✅ Webhook verified");
    console.log("============= event body console START============");
    console.log(bodyString);
    const event = JSON.parse(bodyString);

    console.log("event ", event);
    console.log("============= event body console END============");
    // const event = req.body;

    // ===========================
    // 🎯 Subscription Webhook Logic
    // ===========================

    switch (event.event) {
      case "payment.authorized":
        console.log(
          "Payment Authorized for subscription:",
          event.payload?.payment?.entity?.id
        );

        await PaymentModel.findOneAndUpdate(
          { razorpay_payment_id: event.payload?.payment?.entity?.id },
          { status: event.payload?.payment?.entity?.status }
        );

        // Capture the payment if manual capture
        break;

      case "payment.captured":
        console.log(
          "Subscription Payment Captured:",
          event.payload?.payment?.entity?.id
        );

        await PaymentModel.findOneAndUpdate(
          { razorpay_payment_id: event.payload?.payment?.entity?.id },
          { status: event.payload?.payment?.entity?.status }
        );
        break;
      case "payment.failed":
        console.log(
          "Subscription Payment Captured:",
          event.payload?.payment?.entity?.id
        );
        await PaymentModel.findOneAndUpdate(
          { razorpay_payment_id: event.payload?.payment?.entity?.id },
          { status: event.payload?.payment?.entity?.status }
        );
        break;

      case "subscription.activated":
        console.log(
          "Subscription Activated:",
          event.payload?.subscription?.entity?.id
        );
        
     
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
            subscriptionId: event.payload?.subscription?.entity?.id,
          });
        // Update the user's subscription id and status
        await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        // Mark user subscription active in DB
        break;

      case "subscription.charged":
        console.log(
          "Subscription Recurring Charge Done:",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
            subscriptionId: event.payload?.subscription?.entity?.id,
          });
        // Update the user's subscription id and status
        await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        break;

      case "subscription.pending":
        console.log(
          "Subscription pending (next payment due):",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
            subscriptionId: event.payload?.subscription?.entity?.id,
          });
        // Update the user's subscription id and status
        await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        break;

      case "subscription.halted":
        console.log(
          "Subscription halted due to failed payment:",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        // Warn user to update payment method
        break;

      case "subscription.cancelled":
        console.log(
          "Subscription Cancelled:",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
            subscriptionId: event.payload?.subscription?.entity?.id,
          });
        // Update the user's subscription id and status
        await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        // Mark as cancelled in DB
        break;

      case "subscription.completed":
        console.log(
          "Subscription Completed:",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
            subscriptionId: event.payload?.subscription?.entity?.id,
          });
        // Update the user's subscription id and status
        await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        break;

      default:
        console.log("🔔 Unhandled event:", event.event);
        console.log("🔔 Unhandled event object :", JSON.stringify(event));
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error in Razorpay webhook handler:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
