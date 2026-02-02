import Tasks from "../../models/tasks.model";
import Projects from "../../models/projects.model";
import ProjectLogs from "../../models/projectlogs.model";
import Users from "../../models/users.model";
import Staff from "../../models/staff.model";
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
                        action: `${FRONTEND_URL}/tasks/${task._id}`,
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
        }).populate({
            path: "assignedBy",
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
                        action: `${FRONTEND_URL}/tasks/${task._id}`,
                        actionText: "view task",
                        symbol: "🚨"
                    }),
                    subject: "Task overdue"
                });

                await Tasks.findByIdAndUpdate(task._id, { overdueNotificationSent: true });
            }

            // Notify CS about overdue task
            const assignedBy = task.assignedBy as any;
            const csUser = assignedBy?.userId;

            if (csUser && csUser.email) {
                await EmailQueue.add("CS task overdue", {
                    action: "TASK",
                    data: commonTemplate({
                        title: "Task overdue",
                        content: IN_APP_NOTIFICATION_MESSAGES.CS_TASK_OVERDUE,
                        name: csUser.name,
                        buttonText: "View Task",
                        buttonLink: `${FRONTEND_URL}/tasks/${task._id}`
                    }),
                    email: csUser.email,
                    userId: csUser._id?.toString(),
                    notification: new Notification({
                        title: "Task overdue",
                        description: IN_APP_NOTIFICATION_MESSAGES.CS_TASK_OVERDUE,
                        type: "TASK",
                        action: `${FRONTEND_URL}/tasks/${task._id}`,
                        actionText: "view task",
                        symbol: "⚠️"
                    }),
                    subject: "Task overdue"
                });
            }
        }

        // 3. Check for idle projects (no activity for 3 days)
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        const idleProjects = await Projects.find({
            status: { $nin: ["approved", "closed", "on-hold"] },
            idleNotificationSent: { $ne: true }
        });

        for (const project of idleProjects) {
            const lastLog = await ProjectLogs.findOne({ projectId: project._id })
                .sort({ ActionDate: -1 });

            const lastActivityDate = lastLog ? lastLog.ActionDate : (project as any).createdAt;

            if (lastActivityDate < threeDaysAgo) {
                // Find CS manager
                const customer = await Users.findById(project.userId);
                if (customer && customer.relationship_manager) {
                    const staff = await Staff.findById(customer.relationship_manager).populate("userId");
                    const csUser = staff?.userId as any;

                    if (csUser && csUser.email) {
                        await EmailQueue.add("CS project idle", {
                            action: "PROJECT",
                            data: commonTemplate({
                                title: "Project Inactivity",
                                content: IN_APP_NOTIFICATION_MESSAGES.CS_PROJECT_IDLE,
                                name: csUser.name,
                                buttonText: "View Project",
                                buttonLink: `${FRONTEND_URL}/project-logs/${project._id}`
                            }),
                            email: csUser.email,
                            userId: csUser._id?.toString(),
                            notification: new Notification({
                                title: "Project Inactivity",
                                description: IN_APP_NOTIFICATION_MESSAGES.CS_PROJECT_IDLE,
                                type: "PROJECT",
                                action: `${FRONTEND_URL}/project-logs/${project._id}`,
                                actionText: "view project",
                                symbol: "⏳"
                            }),
                            subject: "Project Inactivity: " + project.title
                        });

                        await Projects.findByIdAndUpdate(project._id, { idleNotificationSent: true });
                    }
                }
            }
        }

    } catch (error) {
        console.error("Error in task deadline worker:", error);
    }
}
