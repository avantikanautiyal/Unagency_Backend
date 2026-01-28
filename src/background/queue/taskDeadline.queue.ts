import { Queue, Worker } from 'bullmq';
import { connection } from '../connection';
import taskDeadlineWorker from '../workers/taskDeadline.worker';

export const TASK_DEADLINE_QUEUE_KEY = "taskDeadline";

export const TaskDeadlineQueue = new Queue(TASK_DEADLINE_QUEUE_KEY, { connection: connection });

const worker = new Worker(TASK_DEADLINE_QUEUE_KEY, taskDeadlineWorker, { connection: connection });

// Add repeatable job to run every hour
TaskDeadlineQueue.add('checkDeadlines', {}, {
    repeat: {
        pattern: '0 * * * *', // Run every hour at minute 0
    }
});
