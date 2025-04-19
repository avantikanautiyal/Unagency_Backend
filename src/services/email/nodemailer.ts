import nodemailer from "nodemailer";
// const email = process.env.email;
// const password = process.env.password;

// console.log(email, password)

const email = "figma.dev2024@gmail.com";
const password = "REDACTED";

const EMAIL="souravsh1234567@gmail.com"
const EMAIL_PASSWORD="ienl wmcc vara xxbk"
const email_s = process.env.EMAIL ?? EMAIL;
const pass = process.env.EMAIL_PASSWORD ?? EMAIL_PASSWORD;
export const transporter = nodemailer.createTransport({
  service: "Gmail",
  //   host: "smtp.gmail.com",
  // port: 465,
  // secure: true,
  auth: {
    user: email_s,
    pass: pass,
  },
  // auth: {
  //     user: email,
  //     pass: password,
  // },
  //   service: "gmail",
  //   auth: {
  //     type: "OAuth2",
  //     user: "your_email@gmail.com",
  //     clientId:
  //       "REDACTED",
  //     clientSecret: "REDACTED",
  //     refreshToken:
  //       "REDACTED",
  //     accessToken:"REDACTED"
  //   },
});
