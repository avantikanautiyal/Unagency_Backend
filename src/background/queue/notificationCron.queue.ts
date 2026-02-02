import cron from 'node-cron';
import notificationCronWorker from '../workers/notificationCron.worker';

// Schedule notification cron job to run every 4 hours
// Cron pattern: minute hour day-of-month month day-of-week
// '0 */4 * * *' = At minute 0 of every 4th hour
cron.schedule('0 */4 * * *', async () => {
    console.log('🔔 Running notification cron job...');
    await notificationCronWorker({});
});

console.log('📧 Notification cron job scheduled to run every 4 hours');
