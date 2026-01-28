import { Notification } from "../utils/notification";
import { generateEmailOption, sendEmail } from "../../utils/emailsender";
import { sendNotificationFCM } from "../../utils/FCM";
import Users from "../../models/users.model";
import Notifications from "../../models/notification.model";
import { projectCreationTemplate } from "../../emailTemplates/projectCreation";
import { requirmentCreationTemplate } from "../../emailTemplates/requirmentCreation";
import { taskAssignTemplate } from "../../emailTemplates/taskAssignmentTemplate";
/**
 * 1)send email for project send 
 * 2) project updates email notificaion send 
 * 3)requirments creation email send
 */
export default async function projectNotificationService(job: any) {

    const { notification: notificaionData }: {
        notification: Notification
    } = job.data;
    const { action }: { action: string } = job.data;
    try {
        switch (notificaionData.type) {
            case "PROJECT":
                const { data }: { data: { userId: string, teamsEmail: string[] } } = job.data
                if (action === "CREATE") await onProjectCreate(data.userId, data.teamsEmail, notificaionData);
                if (action === "UPDATE") await onProjectUpdate(data.userId, data.teamsEmail, notificaionData);

                break;
            case "REQUIRMENT":
                if (action === "CREATE") await onRequirmentCreate(job?.data?.data ?? {}, notificaionData);
                break;
            case "TASK":
                if (action === "ASSIGN") await onTaskAssign(job?.data?.data ?? {}, notificaionData);
                break;
            case "COMMON":
                break;


        }

    } catch (err) {

    }
}
async function onProjectCreate(id: string, teamsEmail: string[], notification: Notification) {
    // if(teamsEmail?.length > 0) 

    const user = await Users.findById(id);
    await Notifications.create({ ...notification, userId: user?._id });
    if (user) {
        await sendNotificationFCM({
            notification,
            user: user as any
        })
    }
    await sendEmail(generateEmailOption({
        email: teamsEmail.length > 0 ? [...teamsEmail, user?.email as string] : user?.email as string,
        subject: "Project is Created",
        html: projectCreationTemplate({
            link: process.env.FRONTEND_URL!,
            name: teamsEmail?.length > 0 ? "Customer" : user?.name as string,
            projectName: notification.title,
            projectDescription: notification.description
        })
    }))
}
async function onProjectUpdate(id: string, teamsEmail: string[], notification: Notification) {
    // if(teamsEmail?.length > 0) 

    const user = await Users.findById(id);
    await Notifications.create({ ...notification, userId: user?._id });
    if (user) {
        await sendNotificationFCM({
            notification,
            user: user as any
        })
    }
    await sendEmail(generateEmailOption({
        email: teamsEmail.length > 0 ? [...teamsEmail, user?.email as string] : user?.email as string,
        subject: "Project is Created",
        html: projectCreationTemplate({
            link: process.env.FRONTEND_URL!,
            name: teamsEmail?.length > 0 ? "Customer" : user?.name as string,
            projectName: notification.title,
            projectDescription: notification.description
        })
    }))
}
async function onRequirmentCreate({ customer, requirment, manager }: any, notification: Notification) {
    try {
        await Notifications.create({ ...notification, userId: manager?._id });
        const user = await Users.findById(manager?._id);
        if (user) {
            await sendNotificationFCM({
                notification,
                user: user as any
            })
        }
        await sendEmail(generateEmailOption({
            email: manager?.userId?.email as string,
            subject: "Requirment is Created",
            html: requirmentCreationTemplate({
                name: manager?.userId?.name,
                customer: { ...customer },
                project: { ...requirment }
            })
        }));

    } catch (err) {

    }
}
async function onTaskAssign(data: any, notification: Notification) {
    try {
        await Notifications.create({ ...notification, userId: data?.userId });
        const user = await Users.findById(data?.userId);
        if (user) {
            await sendNotificationFCM({
                notification,
                user: user as any
            })
        }
        await sendEmail(generateEmailOption({
            email: data.emails,
            subject: "Task is assigned",
            html: taskAssignTemplate({
                assignedBy: data?.assignedBy,
                deadline: data?.deadline,
                name: data?.name,
                description: notification?.description,
                title: notification?.title,
                priority: data?.status,
            })
        }));
    } catch (err) {

    }
}