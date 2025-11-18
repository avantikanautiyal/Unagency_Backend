import Notifications from "../../models/notification.model";
import { generateEmailOption, sendEmail } from "../../utils/emailsender";

export default async function emailBackgroundService(job: any) {
  const { data, notification, email, subject , userId } = job.data;
  console.log("sending email " , email , subject)
  if(email) {
      await sendEmail(
        generateEmailOption({
          email: email,
          subject: subject,
          html: data,
        })
      );
  }
  if(userId) {
   await Notifications.create({...notification, userId: userId});
  }
}
