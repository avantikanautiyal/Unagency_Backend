import { Queue, Worker } from 'bullmq';
import { connection } from '../connection';
import emailBackgroundService from '../workers/email.worker';
import { NotificationType } from '../utils/notification';
type EmailQueType = {
    action: NotificationType,
    data: unknown,
    email : string ;
    subject : string ;
    notification: Notification;
    userId? : string ;
}
export const EMAIL_QUEUE_KEY = "email"

export const EmailQueue = new Queue<EmailQueType, any, string>(EMAIL_QUEUE_KEY, { connection: connection });

const worker = new Worker(EMAIL_QUEUE_KEY, emailBackgroundService, { connection: connection });
