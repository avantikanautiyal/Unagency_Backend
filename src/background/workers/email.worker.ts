// import { Notification } from "../utils/notification";
// import Notifications from "../../models/notification.model";
// import { welcomeSubscriptionTemplate } from "../../emailTemplates/subscription/welcomeMemberSHipEmailTemplate";

import { generateEmailOption, sendEmail } from "../../utils/emailsender";

export default async function emailBackgroundService(job: any) {
  // console.log("email service ", job);

  const { data, notification, email, subject } = job.data;



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
  // const { notification: notificaionData }: {
  //     notification: Notification ,
  //     subject : string ,
  // } = job.data;
  // const { action }: { action: string } = job.data;
  // if (notificaionData) {
  //     try {
  //         switch (notificaionData.type) {
  //             case "COMMON":
  //                 if (action === "SUBSCRIPTION") await onSubscription(job.data.data);
  //                 break;
  //             default:
  //         }
  //     } catch (err) {

  //         console.log("error on sending ", err)

  //     }

  // } else {

  // }
}

// async function onSubscription(emailData: any) {
//     console.log("subscription email send");
//     await sendEmail(generateEmailOption({
//         email: emailData?.email,
//         subject: "Your Premium Subscription Is Now Active",
//         html: welcomeSubscriptionTemplate(emailData)
//     }))
// }
