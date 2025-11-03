import nodemailer from "nodemailer";
import "dotenv/config";

const  {
  CLIENT_ID,
  CLINET_SECRET,
  REFRESH_TOKEN,
  REDIRECT_URL,
  TECH_SUPPORT_EMAIL
} = process.env;
console.log({
  CLIENT_ID,
  CLINET_SECRET,
  REFRESH_TOKEN,
  REDIRECT_URL,
  TECH_SUPPORT_EMAIL
});
export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: TECH_SUPPORT_EMAIL,
    clientId: CLIENT_ID,
    clientSecret: CLINET_SECRET,
    refreshToken: REFRESH_TOKEN,
  },
} as any);
