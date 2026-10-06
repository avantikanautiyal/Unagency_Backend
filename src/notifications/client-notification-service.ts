import mongoose from "mongoose";
import { EmailQueue } from "../background/queue/email.queue";
import {
  Notification,
  NotificationType,
} from "../background/utils/notification";
import { commonTemplate } from "../emailTemplates/unagency/commonTemplate";
import Notifications from "../models/notification.model";
import Users from "../models/users.model";
import { sendNotificationFCM } from "../utils/FCM";
import {
  CLIENT_NOTIFICATION_CATALOG,
  ClientNotificationChannel,
  ClientNotificationEventKey,
  renderTemplate,
} from "./client-notification-catalog";

type NotificationAction = {
  action: string;
  text?: string;
};

export type DispatchClientNotificationInput = {
  eventKey: ClientNotificationEventKey;
  userId: string | mongoose.Types.ObjectId;
  variables?: Readonly<Record<string, string | number | null | undefined>>;
  primaryAction?: NotificationAction;
  secondaryAction?: NotificationAction;
  entityType?: string;
  entityId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  /**
   * A stable operation identifier, such as a webhook ID or project-state
   * version. It is automatically scoped to the recipient and event.
   */
  dedupeKey?: string;
  channels?: readonly ClientNotificationChannel[];
  symbol?: string;
  emailSubject?: string;
};

function legacyType(section: string): NotificationType {
  if (section === "Membership & Billing") return "SUBSCRIPTION";
  if (
    section === "AI Mode" ||
    section === "Hybrid Mode" ||
    section === "Human Mode" ||
    section === "Mode, Service & Project Setup"
  ) {
    return "PROJECT";
  }
  return "COMMON";
}

function categoryFor(section: string): string {
  return section.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function symbolFor(notificationType: string): string {
  switch (notificationType.toLowerCase()) {
    case "success":
    case "celebration":
      return "✓";
    case "warning":
    case "attention":
    case "high":
    case "critical":
      return "!";
    case "error":
      return "×";
    case "reminder":
      return "⏰";
    case "conversion":
      return "↗";
    default:
      return "•";
  }
}

function absoluteAction(action: string): string {
  if (/^https?:\/\//i.test(action)) return action;
  const base = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
  return action.startsWith("/") ? `${base}${action}` : `${base}/${action}`;
}

export async function dispatchClientNotification(
  input: DispatchClientNotificationInput
) {
  try {
    return await deliverClientNotification(input);
  } catch (err) {
    console.error(`Client notification ${input.eventKey} failed`, err);
    return { rendered: null, notification: null };
  }
}

async function deliverClientNotification(
  input: DispatchClientNotificationInput
) {
  const source = CLIENT_NOTIFICATION_CATALOG[input.eventKey];
  const variables = input.variables ?? {};
  const title = renderTemplate(source.title, variables);
  const description = renderTemplate(source.body, variables);
  const channels = input.channels ?? source.channels;

  const rendered = {
    eventKey: input.eventKey,
    title,
    description,
    primaryCta: renderTemplate(source.primaryCta, variables),
    secondaryCta: source.secondaryCta
      ? renderTemplate(source.secondaryCta, variables)
      : undefined,
    channels,
  };

  // UI-only catalogue entries are returned to the caller for toast/modal use.
  if (channels.length === 1 && channels[0] === "ui") {
    return { rendered, notification: null };
  }

  const user = await Users.findById(input.userId);
  if (!user) throw new Error(`Notification recipient not found: ${input.userId}`);

  const type = legacyType(source.section);
  const fullDedupeKey = input.dedupeKey
    ? `${user._id}:${input.eventKey}:${input.dedupeKey}`
    : undefined;
  const notification = new Notification({
    eventKey: input.eventKey,
    title,
    description,
    type,
    notificationType: source.notificationType,
    userState: source.userState,
    tone: source.tone,
    conversionOpportunity: source.conversionOpportunity,
    action: input.primaryAction?.action ?? "",
    actionText: input.primaryAction?.text ?? rendered.primaryCta,
    secondaryAction: input.secondaryAction
      ? {
          action: input.secondaryAction.action,
          text: input.secondaryAction.text ?? rendered.secondaryCta ?? "",
        }
      : undefined,
    category: categoryFor(source.section),
    entityType: input.entityType,
    entityId: input.entityId?.toString(),
    metadata: input.metadata,
    dedupeKey: fullDedupeKey,
    channels: [...channels],
    symbol: input.symbol ?? symbolFor(source.notificationType),
  });

  let stored = null;
  if (channels.includes("in_app")) {
    try {
      stored = await Notifications.create({ ...notification, userId: user._id });
    } catch (err: any) {
      // Duplicate dedupeKey: this event was already delivered on every channel.
      if (err?.code === 11000) return { rendered, notification: null };
      throw err;
    }
  }

  if (channels.includes("push")) {
    await sendNotificationFCM({ notification, user: user as any });
  }

  if (channels.includes("email") && user.email) {
    const buttonLink = input.primaryAction?.action
      ? absoluteAction(input.primaryAction.action)
      : undefined;
    await EmailQueue.add(input.eventKey, {
      action: type,
      data: commonTemplate({
        name: user.name || "there",
        title,
        content: description,
        buttonText: buttonLink ? notification.actionText : undefined,
        buttonLink,
      }),
      email: user.email,
      notification,
      subject: input.emailSubject ?? title,
    });
  }

  return { rendered, notification: stored };
}

