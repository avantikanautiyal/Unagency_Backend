import Tasks from "../../models/tasks.model";
import Users from "../../models/users.model";
import Staff from "../../models/staff.model";
import Subscriptions from "../../models/subscription.model";
import { EmailQueue } from "../queue/email.queue";
import { NOTIFICATION_CONFIG } from "../../utils/constant/emailConstants";
import { Notification } from "../utils/notification";
import { commonTemplate } from "../../emailTemplates/unagency/commonTemplate";
import { parseNotificationContent } from "../../utils/notificationUtils";

const FRONTEND_URL: string = process.env.FRONTEND_URL || "http://localhost:3000";

export default async function notificationCronWorker(job: any) {
    console.log("🔔 Running notification cron job...");
    const now = new Date();

    try {
        // 1. Task Deadline Approaching (24 hours before deadline)
        await checkTaskDeadlineApproaching(now);

        // 2. Task Overdue
        await checkTaskOverdue(now);

        // 3. Subscription Required (for customers without subscription - 3h and 6h reminders)
        await checkSubscriptionRequired(now);

        // 4. Renewal Upcoming (7 days before subscription ends)
        await checkRenewalUpcoming(now);

        // 5. Plan Expired (backup check for expired subscriptions)
        await checkPlanExpired(now);

        console.log("✅ Notification cron job completed successfully");
    } catch (error) {
        console.error("❌ Error in notification cron worker:", error);
    }
}

// ===========================
// 1. Task Deadline Approaching
// ===========================
async function checkTaskDeadlineApproaching(now: Date) {
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const approachingTasks = await Tasks.find({
        deadline: { $gt: now, $lte: twentyFourHoursFromNow },
        status: { $in: ["todo", "progress", "feedback", "revision"] },
        deadlineNotificationSent: { $ne: true }
    }).populate({
        path: "assignedTo",
        populate: { path: "userId" }
    }).populate({
        path: "assignedBy",
        populate: { path: "userId" }
    });

    for (const task of approachingTasks) {
        const assignedTo = task.assignedTo as any;
        const resourceUser = assignedTo?.userId;

        // Notify Resource
        if (resourceUser?.email) {
            await EmailQueue.add("deadline approaching", {
                action: "TASK",
                data: commonTemplate({
                    title: NOTIFICATION_CONFIG.RESOURCE_DEADLINE_APPROACHING.email_subject,
                    content: NOTIFICATION_CONFIG.RESOURCE_DEADLINE_APPROACHING.email_body,
                    name: resourceUser.name,
                    buttonText: "View Task",
                    buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                }),
                email: resourceUser.email,
                userId: resourceUser._id?.toString(),
                notification: new Notification({
                    title: NOTIFICATION_CONFIG.RESOURCE_DEADLINE_APPROACHING.in_app_title,
                    description: NOTIFICATION_CONFIG.RESOURCE_DEADLINE_APPROACHING.in_app_body,
                    type: "TASK",
                    action: "task.open",
                    actionText: "view task",
                    symbol: "⏰"
                }),
                subject: NOTIFICATION_CONFIG.RESOURCE_DEADLINE_APPROACHING.email_subject
            });
        }

        // Notify CS about deadline approaching
        const assignedBy = task.assignedBy as any;
        const csUser = assignedBy?.userId;

        if (csUser?.email) {
            await EmailQueue.add("CS deadline approaching", {
                action: "TASK",
                data: commonTemplate({
                    title: NOTIFICATION_CONFIG.CS_PROJECT_DEADLINE.email_subject,
                    content: NOTIFICATION_CONFIG.CS_PROJECT_DEADLINE.email_body,
                    name: csUser.name,
                    buttonText: "View Task",
                    buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                }),
                email: csUser.email,
                userId: csUser._id?.toString(),
                notification: new Notification({
                    title: NOTIFICATION_CONFIG.CS_PROJECT_DEADLINE.in_app_title,
                    description: NOTIFICATION_CONFIG.CS_PROJECT_DEADLINE.in_app_body,
                    type: "TASK",
                    action: "task.open",
                    actionText: "view task",
                    symbol: "⏰"
                }),
                subject: NOTIFICATION_CONFIG.CS_PROJECT_DEADLINE.email_subject
            });
        }

        await Tasks.findByIdAndUpdate(task._id, { deadlineNotificationSent: true });
    }

    console.log(`📋 Processed ${approachingTasks.length} deadline approaching notifications`);
}

// ===========================
// 2. Task Overdue
// ===========================
async function checkTaskOverdue(now: Date) {
    const overdueTasks = await Tasks.find({
        deadline: { $lt: now },
        status: { $in: ["todo", "progress", "feedback", "revision"] },
        overdueNotificationSent: { $ne: true }
    }).populate({
        path: "assignedTo",
        populate: { path: "userId" }
    }).populate({
        path: "assignedBy",
        populate: { path: "userId" }
    });

    for (const task of overdueTasks) {
        const assignedTo = task.assignedTo as any;
        const resourceUser = assignedTo?.userId;

        // Notify Resource
        if (resourceUser?.email) {
            await EmailQueue.add("task overdue", {
                action: "TASK",
                data: commonTemplate({
                    title: NOTIFICATION_CONFIG.RESOURCE_TASK_OVERDUE.email_subject,
                    content: NOTIFICATION_CONFIG.RESOURCE_TASK_OVERDUE.email_body,
                    name: resourceUser.name,
                    buttonText: "View Task",
                    buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                }),
                email: resourceUser.email,
                userId: resourceUser._id?.toString(),
                notification: new Notification({
                    title: NOTIFICATION_CONFIG.RESOURCE_TASK_OVERDUE.in_app_title,
                    description: NOTIFICATION_CONFIG.RESOURCE_TASK_OVERDUE.in_app_body,
                    type: "TASK",
                    action: "task.open",
                    actionText: "view task",
                    symbol: "🚨"
                }),
                subject: NOTIFICATION_CONFIG.RESOURCE_TASK_OVERDUE.email_subject
            });
        }

        // Notify CS about overdue task
        const assignedBy = task.assignedBy as any;
        const csUser = assignedBy?.userId;

        if (csUser?.email) {
            await EmailQueue.add("CS task overdue", {
                action: "TASK",
                data: commonTemplate({
                    title: NOTIFICATION_CONFIG.CS_TASK_OVERDUE.email_subject,
                    content: NOTIFICATION_CONFIG.CS_TASK_OVERDUE.email_body,
                    name: csUser.name,
                    buttonText: "View Task",
                    buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                }),
                email: csUser.email,
                userId: csUser._id?.toString(),
                notification: new Notification({
                    title: NOTIFICATION_CONFIG.CS_TASK_OVERDUE.in_app_title,
                    description: NOTIFICATION_CONFIG.CS_TASK_OVERDUE.in_app_body,
                    type: "TASK",
                    action: "task.open",
                    actionText: "view task",
                    symbol: "⚠️"
                }),
                subject: NOTIFICATION_CONFIG.CS_TASK_OVERDUE.email_subject
            });
        }

        await Tasks.findByIdAndUpdate(task._id, { overdueNotificationSent: true });
    }

    console.log(`🚨 Processed ${overdueTasks.length} task overdue notifications`);
}

// ===========================
// 3. Subscription Required (3h & 6h reminders)
// ===========================
async function checkSubscriptionRequired(now: Date) {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const sevenHoursAgo = new Date(now.getTime() - 7 * 60 * 60 * 1000); // Buffer for 6h check

    // Find customers without active subscription who registered 3-6 hours ago (first reminder)
    const customersForFirstReminder = await Users.find({
        role: "customer",
        "subscription.status": { $nin: ["active", "completed"] },
        createdAt: { $gte: sixHoursAgo, $lte: threeHoursAgo },
        subscriptionReminderSentAt: { $exists: false }
    });

    for (const customer of customersForFirstReminder) {
        const notificationData = parseNotificationContent(
            NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_body,
            { Name: customer.name || "User" }
        );

        await EmailQueue.add("subscription required - first reminder", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
                title: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_subject,
                content: notificationData.text,
                name: customer.name,
                buttonText: "Upgrade Plan",
                buttonLink: `${FRONTEND_URL}/membership`
            }),
            email: customer.email,
            userId: customer._id.toString(),
            notification: new Notification({
                title: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.in_app_title,
                description: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.in_app_body,
                type: "SUBSCRIPTION",
                action: "/membership",
                actionText: "upgrade plan",
                symbol: "🔓"
            }),
            subject: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_subject
        });

        await Users.findByIdAndUpdate(customer._id, { subscriptionReminderSentAt: now });
    }

    // Find customers who got first reminder 3+ hours ago but still no subscription (second reminder)
    const threeHoursBeforeNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const customersForSecondReminder = await Users.find({
        role: "customer",
        "subscription.status": { $nin: ["active", "completed"] },
        subscriptionReminderSentAt: { $lte: threeHoursBeforeNow },
        createdAt: { $lte: sevenHoursAgo }
    });

    for (const customer of customersForSecondReminder) {
        // Only send if first reminder was sent at least 3 hours ago
        const reminderSentAt = customer.subscriptionReminderSentAt;
        if (reminderSentAt && (now.getTime() - new Date(reminderSentAt).getTime()) >= 3 * 60 * 60 * 1000) {
            const notificationData = parseNotificationContent(
                NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_body,
                { Name: customer.name || "User" }
            );

            await EmailQueue.add("subscription required - second reminder", {
                action: "SUBSCRIPTION",
                data: commonTemplate({
                    title: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_subject,
                    content: notificationData.text,
                    name: customer.name,
                    buttonText: "Upgrade Plan",
                    buttonLink: `${FRONTEND_URL}/membership`
                }),
                email: customer.email,
                userId: customer._id.toString(),
                notification: new Notification({
                    title: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.in_app_title,
                    description: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.in_app_body,
                    type: "SUBSCRIPTION",
                    action: "/membership",
                    actionText: "upgrade plan",
                    symbol: "🔓"
                }),
                subject: NOTIFICATION_CONFIG.SUBSCRIPTION_REQUIRED.email_subject
            });

            // Update with current time to prevent re-sending
            await Users.findByIdAndUpdate(customer._id, { subscriptionReminderSentAt: now });
        }
    }

    console.log(`🔓 Processed ${customersForFirstReminder.length} first reminders and ${customersForSecondReminder.length} second reminder checks`);
}

// ===========================
// 4. Renewal Upcoming (7 days before)
// ===========================
async function checkRenewalUpcoming(now: Date) {
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    // Find active subscriptions ending in 5-7 days
    const upcomingRenewals = await Subscriptions.find({
        status: "active",
        current_end: { $gte: fiveDaysFromNow, $lte: sevenDaysFromNow },
        renewalReminderSentAt: { $exists: false }
    });

    for (const subscription of upcomingRenewals) {
        const customer = await Users.findById(subscription.userId);
        if (!customer?.email) continue;

        const notificationData = parseNotificationContent(
            NOTIFICATION_CONFIG.RENEWAL_UPCOMING.email_body,
            { Name: customer.name || "User" }
        );

        await EmailQueue.add("renewal upcoming", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
                title: NOTIFICATION_CONFIG.RENEWAL_UPCOMING.email_subject,
                content: notificationData.text,
                name: customer.name,
                buttonText: "Manage Plan",
                buttonLink: `${FRONTEND_URL}/profile`
            }),
            email: customer.email,
            userId: customer._id.toString(),
            notification: new Notification({
                title: NOTIFICATION_CONFIG.RENEWAL_UPCOMING.in_app_title,
                description: NOTIFICATION_CONFIG.RENEWAL_UPCOMING.in_app_body,
                type: "SUBSCRIPTION",
                action: "/profile",
                actionText: "manage plan",
                symbol: "📅"
            }),
            subject: NOTIFICATION_CONFIG.RENEWAL_UPCOMING.email_subject
        });

        await Subscriptions.findByIdAndUpdate(subscription._id, { renewalReminderSentAt: now });
    }

    console.log(`📅 Processed ${upcomingRenewals.length} renewal upcoming notifications`);
}

// ===========================
// 5. Plan Expired (backup check)
// ===========================
async function checkPlanExpired(now: Date) {
    // Find subscriptions that should be expired but still marked as active
    const expiredSubscriptions = await Subscriptions.find({
        status: "active",
        current_end: { $lt: now },
        expiredNotificationSent: { $ne: true }
    });

    for (const subscription of expiredSubscriptions) {
        const customer = await Users.findById(subscription.userId);
        if (!customer?.email) continue;

        const notificationData = parseNotificationContent(
            NOTIFICATION_CONFIG.PLAN_EXPIRED.email_body,
            { Name: customer.name || "User" }
        );

        await EmailQueue.add("plan expired", {
            action: "SUBSCRIPTION",
            data: commonTemplate({
                title: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject,
                content: notificationData.text,
                name: customer.name,
                buttonText: "Renew Plan",
                buttonLink: `${FRONTEND_URL}/membership`
            }),
            email: customer.email,
            userId: customer._id.toString(),
            notification: new Notification({
                title: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_title,
                description: NOTIFICATION_CONFIG.PLAN_EXPIRED.in_app_body,
                type: "SUBSCRIPTION",
                action: "/membership",
                actionText: "renew plan",
                symbol: "⏰"
            }),
            subject: NOTIFICATION_CONFIG.PLAN_EXPIRED.email_subject
        });

        // Also update the user's subscription status
        await Users.findByIdAndUpdate(customer._id, {
            "subscription.status": "expired"
        });

        await Subscriptions.findByIdAndUpdate(subscription._id, {
            expiredNotificationSent: true,
            status: "expired"
        });

        // Notify CS about account expiry
        if (customer.relationship_manager) {
            const staff = await Staff.findById(customer.relationship_manager).populate("userId");
            const csUser = staff?.userId as any;

            if (csUser?.email) {
                await EmailQueue.add("CS account expired", {
                    action: "SUBSCRIPTION",
                    data: commonTemplate({
                        title: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_subject,
                        content: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_body,
                        name: csUser.name,
                        buttonText: "View Client",
                        buttonLink: `${FRONTEND_URL}/customers/${customer._id}`
                    }),
                    email: csUser.email,
                    userId: csUser._id?.toString(),
                    notification: new Notification({
                        title: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.in_app_title,
                        description: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.in_app_body,
                        type: "SUBSCRIPTION",
                        action: "customer.view",
                        actionText: "view client",
                        symbol: "⚠️"
                    }),
                    subject: NOTIFICATION_CONFIG.CS_ACCOUNT_PAUSED.email_subject
                });
            }
        }
    }

    console.log(`⏰ Processed ${expiredSubscriptions.length} plan expired notifications`);
}
