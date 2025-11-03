import nodemailer from "nodemailer";
import { google } from "googleapis";
import "dotenv/config";

const CLIENT_ID = "REDACTED";
const CLINET_SECRET = "REDACTED";
const  REFRESH_TOKEN  = "REDACTED";
const REDIRECT_URL = "https://developers.google.com/oauthplayground";
const MY_EMAIL = "tech@prakria.com";
const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID , CLINET_SECRET , REDIRECT_URL
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendEmail() {
//   const { token: accessToken } = await oAuth2Client.getAccessToken();
//   console.log(accessToken)

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: MY_EMAIL,
      clientId: CLIENT_ID,
      clientSecret: CLINET_SECRET,
      refreshToken: REFRESH_TOKEN
    },
  } as any);

  const info = await transporter.sendMail({
    from: `UNAGENCY`,
    to: "sourav.sharma@prakria.com",
    subject: "Hello from Gmail + Nodemailer",
    text: "It works!",
    html: "<p>It works! 🎉</p>",
  });

  console.log("Message sent:", info.messageId);
}

sendEmail().catch(console.error);
