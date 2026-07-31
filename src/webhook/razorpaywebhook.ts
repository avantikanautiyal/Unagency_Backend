import { Request, Response } from "express";
import Subscriptions from "../models/subscription.model";
import PaymentModel from "../models/payment.model";
import Users from "../models/users.model";
import Staff from "../models/staff.model";
import { EmailQueue } from "../background/queue/email.queue";

import { Notification } from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
const FRONTEND_URL: string = process.env.FRONTEND_URL!;
import { IN_APP_NOTIFICATION_MESSAGES, NOTIFICATION_CONFIG } from "../utils/constant/emailConstants";
import { parseNotificationContent } from "../utils/notificationUtils";
import {
  defaultWebhookIdempotencyStore,
  razorpayWebhookEventId,
  verifyRazorpayWebhookSignature,
} from "./razorpay-webhook-security";

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!;
export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    console.log("webhook called....");
    const signature = req.headers["x-razorpay-signature"];

    // req.body is a Buffer when using express.raw()
    const rawBody = req.body as Buffer;
    const bodyString = rawBody.toString("utf8");

    if (
      !verifyRazorpayWebhookSignature({
        rawBody: bodyString,
        signature: typeof signature === "string" ? signature : undefined,
        secret: webhookSecret ?? "",
      })
    ) {
      console.error("❌ Invalid Razorpay webhook signature");
      return res.status(400).send("Invalid signature");
    }

    console.log("✅ Webhook verified");
    const event = JSON.parse(bodyString);
    const eventId = razorpayWebhookEventId(event);
    const claim = await defaultWebhookIdempotencyStore.tryClaim(eventId);
    if (claim === "duplicate") {
      console.log("♻️ Duplicate Razorpay webhook ignored:", eventId);
      return res.status(200).json({ status: "duplicate" });
    }

    console.log("============= event body console START============");
    console.log(bodyString);
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
        );

        console.log("customer activated ", customer);

        if (customer?.relationship_manager) {
          const staff = await Staff.findById(customer.relationship_manager).populate("userId");
          const relationship_manager = staff?.userId as any;

          if (relationship_manager) {
            EmailQueue.add("relationship manager subscription taken", {
              action: "SUBSCRIPTION",
              data: commonTemplate({
                title: NOTIFICATION_CONFIG.CS_CLIENT_ACTIVATED.email_subject,
                content: NOTIFICATION_CONFIG.CS_CLIENT_ACTIVATED.email_body,
                name: relationship_manager?.name!,
                buttonText: "View Client",
                buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
              }),
              email: relationship_manager?.email!,
              userId: relationship_manager?._id.toString(),
              notification: new Notification({
                title: NOTIFICATION_CONFIG.CS_CLIENT_ACTIVATED.in_app_title,
                description: NOTIFICATION_CONFIG.CS_CLIENT_ACTIVATED.in_app_body,
                type: "SUBSCRIPTION",
                action: `${FRONTEND_URL}/customers/${customer?._id}`,
                actionText: "view client",
                symbol: "🎉",
              }),
              subject: NOTIFICATION_CONFIG.CS_CLIENT_ACTIVATED.email_subject,
            });
          }
        }

        if (customer) {
          const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.INVOICE_GENERATED.email_body, { Name: customer.name || "User" });
          EmailQueue.add("invoice generated", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: NOTIFICATION_CONFIG.INVOICE_GENERATED.email_subject,
              content: notificationData.text,
              name: customer.name,
              buttonText: "Download Invoice",
              buttonLink: `${FRONTEND_URL}/profile-settings`,
            }),
            email: customer.email,
            userId: customer._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.INVOICE_GENERATED.in_app_title,
              description: NOTIFICATION_CONFIG.INVOICE_GENERATED.in_app_body,
              type: "SUBSCRIPTION",
              action: `/profile-settings`,
              actionText: "Download Invoice",
              symbol: "📄",
            }),
            subject: NOTIFICATION_CONFIG.INVOICE_GENERATED.email_subject,
          });
        }

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
        var customer_charged = await Users.findOneAndUpdate(
          { _id: subs?.userId },
          {
            $set: {
              "subscription.id": event.payload?.subscription?.entity?.id,
              "subscription.status": event.payload?.subscription?.entity?.status,
            },
          }
        );

        if (customer_charged) {
          const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.email_body, { Name: customer_charged.name || "User" });
          EmailQueue.add("payment success", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.email_subject,
              content: notificationData.text,
              name: customer_charged.name,
              buttonText: notificationData.cta,
              buttonLink: `${FRONTEND_URL}`,
            }),
            email: customer_charged.email,
            userId: customer_charged._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.in_app_title,
              description: NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.in_app_body,
              type: "SUBSCRIPTION",
              action: `${FRONTEND_URL}/membership`,
              actionText: "view subscription",
              symbol: "💰",
            }),
            subject: NOTIFICATION_CONFIG.PAYMENT_SUCCESSFUL.email_subject,
          });
        }

        // Notify CS about payment success
        if (customer_charged) {
          const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.INVOICE_GENERATED.email_body, { Name: customer_charged.name || "User" });
          EmailQueue.add("invoice generated", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: NOTIFICATION_CONFIG.INVOICE_GENERATED.email_subject,
              content: notificationData.text,
              name: customer_charged.name,
              buttonText: "Download Invoice",
              buttonLink: `${FRONTEND_URL}/profile-settings`,
            }),
            email: customer_charged.email,
            userId: customer_charged._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.INVOICE_GENERATED.in_app_title,
              description: NOTIFICATION_CONFIG.INVOICE_GENERATED.in_app_body,
              type: "SUBSCRIPTION",
              action: `/profile-settings`,
              actionText: "Download Invoice",
              symbol: "📄",
            }),
            subject: NOTIFICATION_CONFIG.INVOICE_GENERATED.email_subject,
          });
        }

        if (customer_charged?.relationship_manager) {
          const staff_charged = await Staff.findById(customer_charged.relationship_manager).populate("userId");
          const relationship_manager_charged = staff_charged?.userId as any;

          if (relationship_manager_charged) {
            EmailQueue.add("CS payment success", {
              action: "SUBSCRIPTION",
              data: commonTemplate({
                title: NOTIFICATION_CONFIG.CS_PAYMENT_SUCCESSFUL.email_subject,
                content: NOTIFICATION_CONFIG.CS_PAYMENT_SUCCESSFUL.email_body,
                name: relationship_manager_charged?.name!,
                buttonText: "View Client",
                buttonLink: `${FRONTEND_URL}/customers/${subs?.userId}`,
              }),
              email: relationship_manager_charged?.email!,
              userId: relationship_manager_charged?._id.toString(),
              notification: new Notification({
                title: NOTIFICATION_CONFIG.CS_PAYMENT_SUCCESSFUL.in_app_title,
                description: NOTIFICATION_CONFIG.CS_PAYMENT_SUCCESSFUL.in_app_body,
                type: "SUBSCRIPTION",
                action: `${FRONTEND_URL}/customers/${subs?.userId}`,
                actionText: "view client",
                symbol: "💰",
              }),
              subject: NOTIFICATION_CONFIG.CS_PAYMENT_SUCCESSFUL.email_subject,
            });
          }
        }
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
          const notificationData = parseNotificationContent(NOTIFICATION_CONFIG.PAYMENT_FAILED.email_body, { Name: customer.name || "User" });
          EmailQueue.add("payment failed", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: NOTIFICATION_CONFIG.PAYMENT_FAILED.email_subject,
              content: notificationData.text,
              name: customer?.name!,
              buttonText: notificationData.cta,
              buttonLink: `${FRONTEND_URL}/subscription`,
            }),
            email: customer?.email!,
            userId: customer?._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.PAYMENT_FAILED.in_app_title,
              description: NOTIFICATION_CONFIG.PAYMENT_FAILED.in_app_body,
              type: "SUBSCRIPTION",
              action: `${FRONTEND_URL}/membership`,
              actionText: "view subscription",
              symbol: "💳",
            }),
            subject: NOTIFICATION_CONFIG.PAYMENT_FAILED.email_subject,
          });

          // Notify CS about payment failure
          const relationship_manager = await Users.findOne({
            _id: (customer?.relationship_manager as any),
          });

          if (relationship_manager) {
            EmailQueue.add("CS payment failed", {
              action: "SUBSCRIPTION",
              data: commonTemplate({
                title: NOTIFICATION_CONFIG.CS_PAYMENT_FAILED.email_subject,
                content: NOTIFICATION_CONFIG.CS_PAYMENT_FAILED.email_body,
                name: relationship_manager?.name!,
                buttonText: "View Client",
                buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
              }),
              email: relationship_manager?.email!,
              userId: relationship_manager?._id.toString(),
              notification: new Notification({
                title: NOTIFICATION_CONFIG.CS_PAYMENT_FAILED.in_app_title,
                description: NOTIFICATION_CONFIG.CS_PAYMENT_FAILED.in_app_body,
                type: "SUBSCRIPTION",
                action: `${FRONTEND_URL}/customers/${customer?._id}`,
                actionText: "view client",
                symbol: "⚠️",
              }),
              subject: NOTIFICATION_CONFIG.CS_PAYMENT_FAILED.email_subject,
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
        // todo
        const notificationDataCancelled = parseNotificationContent(NOTIFICATION_CONFIG.PLAN_EXPIRED.email_body, { Name: customer?.name || "User" });
        EmailQueue.add("subscription cancelled", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject,
            content: notificationDataCancelled.text,
            name: customer?.name!,
            buttonText: notificationDataCancelled.cta,
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_title,
            description: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_body,
            type: "SUBSCRIPTION",
            action: `${FRONTEND_URL}/membership`,
            actionText: "view subscription",
            symbol: "⏰",
          }),
          subject: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject,
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
        // Notify user about paused subscription
        const notificationDataPaused = parseNotificationContent(NOTIFICATION_CONFIG.PLAN_EXPIRED.email_body, { Name: customer?.name || "User" });
        EmailQueue.add("subscription paused", {
          action: "SUBSCRIPTION",
          data: commonTemplate({
            title: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject,
            content: notificationDataPaused.text,
            name: customer?.name!,
            buttonText: notificationDataPaused.cta,
            buttonLink: `${FRONTEND_URL}/subscription`,
          }),
          email: customer?.email!,
          userId: customer?._id.toString(),
          notification: new Notification({
            title: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_title,
            description: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_body,
            type: "SUBSCRIPTION",
            action: `${FRONTEND_URL}/membership`,
            actionText: "view subscription",
            symbol: "⏸️",
          }),
          subject: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject,
        });

        // Notify CS about account pause
        const rm_paused = await Users.findOne({
          _id: (customer?.relationship_manager as any),
        });

        if (rm_paused) {
          EmailQueue.add("CS subscription paused", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
              title: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_subject,
              content: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_body,
              name: rm_paused?.name!,
              buttonText: "View Client",
              buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
            }),
            email: rm_paused?.email!,
            userId: rm_paused?._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.in_app_title,
              description: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.in_app_body,
              type: "SUBSCRIPTION",
              action: `${FRONTEND_URL}/customers/${customer?._id}`,
              actionText: "view client",
              symbol: "⏸️",
            }),
            subject: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_subject,
          });
        }


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
            action: `${FRONTEND_URL}/membership`,
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
              title: NOTIFICATION_CONFIG.CS_ACCOUNT_RESUMED.email_subject,
              content: NOTIFICATION_CONFIG.CS_ACCOUNT_RESUMED.email_body,
              name: rm_resumed?.name!,
              buttonText: "View Client",
              buttonLink: `${FRONTEND_URL}/customers/${customer?._id}`,
            }),
            email: rm_resumed?.email!,
            userId: rm_resumed?._id.toString(),
            notification: new Notification({
              title: NOTIFICATION_CONFIG.CS_ACCOUNT_RESUMED.in_app_title,
              description: NOTIFICATION_CONFIG.CS_ACCOUNT_RESUMED.in_app_body,
              type: "SUBSCRIPTION",
              action: `${FRONTEND_URL}/customers/${customer?._id}`,
              actionText: "view client",
              symbol: "▶️",
            }),
            subject: NOTIFICATION_CONFIG.CS_ACCOUNT_RESUMED.email_subject,
          });
        }


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
            action: `${FRONTEND_URL}/membership`,
            actionText: "view subscription",
            symbol: "🔄",
          }),
          subject: "Your subscription has been updated",
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
