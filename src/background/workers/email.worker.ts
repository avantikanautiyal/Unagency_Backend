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
    if (user) {
      await sendNotificationFCM({
        notification: notification,
        user: user as any
      });
    }
    await Notifications.create({ ...notification, userId: userId });
  }
}
