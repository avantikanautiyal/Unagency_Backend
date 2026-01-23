import { Request, Response } from "express";
import Subscriptions from "../models/subscription.model";
import PaymentModel from "../models/payment.model";
import crypto from "crypto";
import Users from "../models/users.model";
import { EmailQueue } from "../background/queue/email.queue";
import { sendNotificationFCM } from "../utils/FCM";
import { Notification } from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;
import { IN_APP_NOTIFICATION_MESSAGES } from "../utils/constant/emailConstants";

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
        }).populate({ path: "planId", foreignField: "plan_id" });
        // Update the user's subscription id and status
        var customer = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        ).populate("relationship_manager");
        console.log("customer activated ", customer);
        const relationship_manager = await Users.findOne({
          _id: (customer?.relationship_manager as any)?.userId,
        });

        EmailQueue.add("subscription taken", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: "Boom. You’re officially in.",
            content: IN_APP_NOTIFICATION_MESSAGES.PAYMENT_SUCCESSFUL,
            name: customer?.name!,
            buttonText: "Access Dashboard",
            buttonLink: `${FRONTEND_URL}/dashboard`,
          }),
          email: customer?.email!,

          userId: customer?._id.toString(),
          notification: new Notification({
            title: "Payment successful",
            description: "You’re officially in.",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "🍾",
          }),
          subject: "Boom. You’re officially in.",
        });

        if (relationship_manager) {
          EmailQueue.add("relationship manager subscription taken", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: "New client activated",
              content: IN_APP_NOTIFICATION_MESSAGES.CS_CLIENT_MEMBERSHIP_ACTIVATED,
              name: relationship_manager?.name!,
              buttonText: "View Client",
              buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
            }),
            email: relationship_manager?.email!,
            userId: relationship_manager?._id.toString(),
            notification: new Notification({
              title: "Client membership activated successfully",
              description: IN_APP_NOTIFICATION_MESSAGES.CS_CLIENT_MEMBERSHIP_ACTIVATED,
              type: "SUBSCRIPTION",
              action: "customer.view",
              actionText: "view client",
              symbol: "🎉",
            }),
            subject: "New client activated",
          });
        }
        // currently sending a notificaiton to only a owner
        await sendNotificationFCM({
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been activated",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "🍾",
          }),
          user: customer as any,
        });
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
        var subs = await Subscriptions.findOne({
          subscriptionId: event.payload?.subscription?.entity?.id,
        }).populate({ path: "planId", foreignField: "plan_id" });

        var customer = await Users.findOne({ _id: subs?.userId });

        if (customer) {
          EmailQueue.add("payment failed", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: "Payment didn’t land. Let’s fix it.",
              content: IN_APP_NOTIFICATION_MESSAGES.PAYMENT_FAILED,
              name: customer?.name!,
              buttonText: "Retry Payment",
              buttonLink: `${FRONTEND_URL}/subscription`,
            }),
            email: customer?.email!,
            userId: customer?._id.toString(),
            notification: new Notification({
              title: "Payment failed",
              description: "Payment didn’t land. Let’s fix it.",
              type: "SUBSCRIPTION",
              action: "subscription.open",
              actionText: "view subscription",
              symbol: "💳",
            }),
            subject: "Payment didn’t land. Let’s fix it.",
          });

          // Notify CS about payment failure
          const relationship_manager = await Users.findOne({
            _id: (customer?.relationship_manager as any),
          });

          if (relationship_manager) {
            EmailQueue.add("CS payment failed", {
              action: "SUBSCRIPTION",
              data: commonTemplate({
                title: "Payment failed",
                content: IN_APP_NOTIFICATION_MESSAGES.CS_PAYMENT_FAILED,
                name: relationship_manager?.name!,
                buttonText: "View Client",
                buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
              }),
              email: relationship_manager?.email!,
              userId: relationship_manager?._id.toString(),
              notification: new Notification({
                title: "Client payment failed",
                description: IN_APP_NOTIFICATION_MESSAGES.CS_PAYMENT_FAILED,
                type: "SUBSCRIPTION",
                action: "customer.view",
                actionText: "view client",
                symbol: "⚠️",
              }),
              subject: "Payment failed",
            });
          }
        }
        break;

      case "subscription.cancelled":
        console.log(
          "Subscription Cancelled:",
          event.payload?.subscription?.entity?.id,

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
        }).populate({ path: "planId", foreignField: "plan_id" });
        // Update the user's subscription id and status

        var customer = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );
        console.log("subscription cancelled customer : ", customer);
        // todo
        EmailQueue.add("subscription cancelled", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: "Plan snoozed. Let’s wake it up.",
            content: IN_APP_NOTIFICATION_MESSAGES.PLAN_EXPIRED,
            name: customer?.name!,
            buttonText: "Renew Plan",
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: "Plan expired",
            description: "Plan snoozed. Let’s wake it up.",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "⏰",
          }),
          subject: "Plan snoozed. Let’s wake it up.",
        });
        // currently sending a notificaiton to only a owner
        await sendNotificationFCM({
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been Cancelled",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscriptions",
            symbol: "🍾",
          }),
          user: customer as any,
        });
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

      case "subscription.authenticated":
        console.log(
          "Subscription Authenticated:",
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

      case "subscription.paused":
        console.log(
          "Subscription Paused:",
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
        }).populate({ path: "planId", foreignField: "plan_id" });

        var customer = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );

        // Notify user about paused subscription
        EmailQueue.add("subscription paused", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: "Client account paused",
            content: IN_APP_NOTIFICATION_MESSAGES.PLAN_EXPIRED,
            name: customer?.name!,
            buttonText: "View Subscription",
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: "Client account paused due to subscription non-renewal",
            description: IN_APP_NOTIFICATION_MESSAGES.PLAN_EXPIRED,
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "⏸️",
          }),
          subject: "Client account paused",
        });

        // Notify CS about account pause
        const rm_paused = await Users.findOne({
          _id: (customer?.relationship_manager as any),
        });

        if (rm_paused) {
          EmailQueue.add("CS subscription paused", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: "Client account paused",
              content: IN_APP_NOTIFICATION_MESSAGES.CS_ACCOUNT_PAUSED,
              name: rm_paused?.name!,
              buttonText: "View Client",
              buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
            }),
            email: rm_paused?.email!,
            userId: rm_paused?._id.toString(),
            notification: new Notification({
              title: "Client account paused",
              description: IN_APP_NOTIFICATION_MESSAGES.CS_ACCOUNT_PAUSED,
              type: "SUBSCRIPTION",
              action: "customer.view",
              actionText: "view client",
              symbol: "⏸️",
            }),
            subject: "Client account paused",
          });
        }

        await sendNotificationFCM({
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been paused",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "⏸️",
          }),
          user: customer as any,
        });
        break;

      case "subscription.resumed":
        console.log(
          "Subscription Resumed:",
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
        }).populate({ path: "planId", foreignField: "plan_id" });

        var customer = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );

        // Notify user about resumed subscription
        EmailQueue.add("subscription resumed", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: "Client account resumed",
            content: `Welcome back! Your subscription has been resumed successfully.`,
            name: customer?.name!,
            buttonText: "View Subscription",
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: "Client account has been resumed",
            description: "Your subscription has been resumed",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "▶️",
          }),
          subject: "Client account resumed",
        });

        // Notify CS about account resume
        const rm_resumed = await Users.findOne({
          _id: (customer?.relationship_manager as any),
        });

        if (rm_resumed) {
          EmailQueue.add("CS subscription resumed", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: "Client account resumed",
              content: IN_APP_NOTIFICATION_MESSAGES.CS_ACCOUNT_RESUMED,
              name: rm_resumed?.name!,
              buttonText: "View Client",
              buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
            }),
            email: rm_resumed?.email!,
            userId: rm_resumed?._id.toString(),
            notification: new Notification({
              title: "Client account resumed",
              description: IN_APP_NOTIFICATION_MESSAGES.CS_ACCOUNT_RESUMED,
              type: "SUBSCRIPTION",
              action: "customer.view",
              actionText: "view client",
              symbol: "▶️",
            }),
            subject: "Client account resumed",
          });
        }

        await sendNotificationFCM({
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been resumed",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "▶️",
          }),
          user: customer as any,
        });
        break;

      case "subscription.updated":
        console.log(
          "Subscription Updated:",
          event.payload?.subscription?.entity?.id
        );
        await Subscriptions.findOneAndUpdate(
          { subscriptionId: event.payload?.subscription?.entity?.id },
          {
            status: event.payload?.subscription?.entity?.status,
            planId: event.payload?.subscription?.entity?.plan_id,
            current_start: event.payload?.subscription?.entity?.current_start,
            current_end: event.payload?.subscription?.entity?.current_end,
          }
        );
        var subs = await Subscriptions.findOne({
          subscriptionId: event.payload?.subscription?.entity?.id,
        }).populate({ path: "planId", foreignField: "plan_id" });

        var customer = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );

        // Notify user about updated subscription
        EmailQueue.add("subscription updated", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: "UNAGENCY",
            content: `Your subscription has been updated successfully.`,
            name: customer?.name!,
            buttonText: "View Subscription",
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been updated",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "🔄",
          }),
          subject: "Your subscription has been updated",
        });

        await sendNotificationFCM({
          notification: new Notification({
            title: (subs?.planId as any)?.name!,
            description: "Your subscription has been updated",
            type: "SUBSCRIPTION",
            action: "subscription.open",
            actionText: "view subscription",
            symbol: "🔄",
          }),
          user: customer as any,
        });
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
