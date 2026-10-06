import Notifications from "../../models/notification.model";
import { generateEmailOption, sendEmail } from "../../utils/emailsender";
import { sendNotificationFCM } from "../../utils/FCM";
import Users from "../../models/users.model";

export default async function emailBackgroundService(job: any) {
  const { data, notification, email, subject, userId } = job.data;
  console.log("sending email ", email, subject)
  if (email) {
    await sendEmail(
      generateEmailOption({
        email: email,
        subject: subject,
        html: data,
      })
    );
  }
  if (userId) {
    const user = await Users.findById(userId);
    const channels = Array.isArray(notification?.channels)
      ? notification.channels
      : undefined;
    if (user && (!channels || channels.includes("push"))) {
      await sendNotificationFCM({
        notification: notification,
        user: user as any
      });
    }
    if (!channels || channels.includes("in_app")) {
      if (notification?.dedupeKey) {
        await Notifications.findOneAndUpdate(
          { dedupeKey: notification.dedupeKey },
          { $setOnInsert: { ...notification, userId } },
          { upsert: true }
        );
      } else {
        await Notifications.create({ ...notification, userId });
      }
    }
  }
}
