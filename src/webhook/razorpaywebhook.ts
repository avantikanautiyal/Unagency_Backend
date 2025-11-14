import { Request, Response } from "express";
import crypto from "crypto";

const webhookSecret = "123456654321";
export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.error("❌ Invalid Razorpay webhook signature");
      return res.status(400).send("Invalid signature");
    }

    console.log("✅ Webhook verified");
    const event = req.body;

    // ===========================
    // 🎯 Subscription Webhook Logic
    // ===========================
    switch (event.event) {
      case "payment.authorized":
        console.log(
          "Payment Authorized for subscription:",
          event.payload?.payment?.entity?.subscription_id
        );
        // Capture the payment if manual capture
        break;

      case "payment.captured":
        console.log(
          "Subscription Payment Captured:",
          event.payload?.payment?.entity?.id
        );
        break;

      case "subscription.activated":
        console.log(
          "Subscription Activated:",
          event.payload?.subscription?.entity?.id
        );
        // Mark user subscription active in DB
        break;

      case "subscription.charged":
        console.log(
          "Subscription Recurring Charge Done:",
          event.payload?.subscription?.entity?.id
        );
        break;

      case "subscription.pending":
        console.log(
          "Subscription pending (next payment due):",
          event.payload?.subscription?.entity?.id
        );
        break;

      case "subscription.halted":
        console.log(
          "Subscription halted due to failed payment:",
          event.payload?.subscription?.entity?.id
        );
        // Warn user to update payment method
        break;

      case "subscription.cancelled":
        console.log(
          "Subscription Cancelled:",
          event.payload?.subscription?.entity?.id
        );
        // Mark as cancelled in DB
        break;

      case "subscription.completed":
        console.log(
          "Subscription Completed:",
          event.payload?.subscription?.entity?.id
        );
        break;

      default:
        console.log("🔔 Unhandled event:", event.event);
    }

    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Error in Razorpay webhook handler:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};