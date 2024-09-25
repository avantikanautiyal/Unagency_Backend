import Mail from "nodemailer/lib/mailer";
import { transporter } from "../../services/email/nodemailer"
const myEmail = process.env.email;

type EmailOptions = {
    email: string;
    subject: string;
    // text?: string;
    html: string;
}
export function generateEmailOption({ email, subject, html }: EmailOptions) {
    return {
        from: myEmail!,
        to: email,
        subject: subject,
        // text: text,
        html: html
    }
}
export async function sentEmail(mail: Mail.Options) {
    try {
        console.log(mail)
        return await transporter.sendMail(mail);
    } catch (err) {
        console.log(err)
    }
}

