import nodemailer from "nodemailer";
import { google } from "googleapis";
import "dotenv/config";

const {
  CLIENT_ID,
  CLINET_SECRET,
  REFRESH_TOKEN,
  REDIRECT_URL,
  TECH_SUPPORT_EMAIL,
} = process.env;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLINET_SECRET,
  REDIRECT_URL
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendEmail() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: TECH_SUPPORT_EMAIL,
      clientId: CLIENT_ID,
      clientSecret: CLINET_SECRET,
      refreshToken: REFRESH_TOKEN,
    },
  } as any);

  const info = await transporter.sendMail({
    from: `UNAGENCY`,
    to: TECH_SUPPORT_EMAIL,
    subject: "Hello from Gmail + Nodemailer",
    text: "It works!",
    html: "<p>It works! 🎉</p>",
  });

  console.log("Message sent:", info.messageId);
}

sendEmail().catch(console.error);
