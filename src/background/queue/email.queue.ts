import { Queue, Worker } from 'bullmq';
import { connection } from '../connection';
// import projectNotificationService from '../workers/projectNotification.worker';
// import { Notification } from '../utils/notification';
import emailBackgroundService from '../workers/email.worker';
type EmailQueType = {
    action: "SUBSCRIPTION",
    data: unknown,
    notification: Notification
}
export const EMAIL_QUEUE_KEY = "email"

export const EmailQueue = new Queue<EmailQueType, any, string>(EMAIL_QUEUE_KEY, { connection: connection });

const worker = new Worker(EMAIL_QUEUE_KEY, emailBackgroundService, { connection: connection });
