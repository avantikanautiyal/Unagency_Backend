import { Queue, Worker } from 'bullmq';
import projectNotificationService from '../workers/projectNotification.worker';
import { connection } from '../connection';
import { Notification } from '../utils/notification';
type ProjectQueType = {
    action: "CREATE" | "PROCESS",
    data: unknown,
    notification: Notification
}
export const PROJECT_NOTIFICATION_QUEUE_KEY = "requirment"

export const projectNotification = new Queue<ProjectQueType, any, string>(PROJECT_NOTIFICATION_QUEUE_KEY, { connection: connection });

const worker = new Worker(PROJECT_NOTIFICATION_QUEUE_KEY, projectNotificationService, { connection: connection });
