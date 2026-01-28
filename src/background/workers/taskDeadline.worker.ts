import Tasks from "../../models/tasks.model";
import { EmailQueue } from "../queue/email.queue";
import { IN_APP_NOTIFICATION_MESSAGES } from "../../utils/constant/emailConstants";
import { Notification } from "../utils/notification";
import { commonTemplate } from "../../emailTemplates/unagency/commonTemplate";

const FRONTEND_URL: string = process.env.FRONTEND_URL || "http://localhost:3000";

export default async function taskDeadlineWorker(job: any) {
    try {
        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        // 1. Check for deadline approaching (within 24h)
        const approachingTasks = await Tasks.find({
            deadline: { $gt: now, $lte: twentyFourHoursFromNow },
            status: { $in: ["todo", "progress", "feedback", "revision"] },
            deadlineNotificationSent: { $ne: true }
        }).populate({
            path: "assignedTo",
            populate: { path: "userId" }
        });

        for (const task of approachingTasks) {
            const assignedTo = task.assignedTo as any;
            const user = assignedTo?.userId;

            if (user && user.email) {
                await EmailQueue.add("deadline approaching", {
                    action: "TASK",
                    data: commonTemplate({
                        title: "Deadline reminder",
                        content: IN_APP_NOTIFICATION_MESSAGES.RESOURCE_DEADLINE_APPROACHING,
                        name: user.name,
                        buttonText: "View Task",
                        buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                    }),
                    email: user.email,
                    userId: user._id?.toString(),
                    notification: new Notification({
                        title: "Deadline reminder",
                        description: IN_APP_NOTIFICATION_MESSAGES.RESOURCE_DEADLINE_APPROACHING,
                        type: "TASK",
                        action: "task.open",
                        actionText: "view task",
                        symbol: "⏰"
                    }),
                    subject: "Deadline reminder"
                });

                await Tasks.findByIdAndUpdate(task._id, { deadlineNotificationSent: true });
            }
        }

        // 2. Check for overdue tasks
        const overdueTasks = await Tasks.find({
            deadline: { $lt: now },
            status: { $in: ["todo", "progress", "feedback", "revision"] },
            overdueNotificationSent: { $ne: true }
        }).populate({
            path: "assignedTo",
            populate: { path: "userId" }
        });

        for (const task of overdueTasks) {
            const assignedTo = task.assignedTo as any;
            const user = assignedTo?.userId;

            if (user && user.email) {
                await EmailQueue.add("task overdue", {
                    action: "TASK",
                    data: commonTemplate({
                        title: "Task overdue",
                        content: IN_APP_NOTIFICATION_MESSAGES.RESOURCE_TASK_OVERDUE,
                        name: user.name,
                        buttonText: "View Task",
                        buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                    }),
                    email: user.email,
                    userId: user._id?.toString(),
                    notification: new Notification({
                        title: "Task overdue",
                        description: IN_APP_NOTIFICATION_MESSAGES.RESOURCE_TASK_OVERDUE,
                        type: "TASK",
                        action: "task.open",
                        actionText: "view task",
                        symbol: "🚨"
                    }),
                    subject: "Task overdue"
                });

                await Tasks.findByIdAndUpdate(task._id, { overdueNotificationSent: true });
            }
        }

    } catch (error) {
        console.error("Error in task deadline worker:", error);
    }
}
