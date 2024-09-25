import nodemailer from "nodemailer";
// const email = process.env.email;
// const password = process.env.password;

// console.log(email, password)

const email = "figma.dev2024@gmail.com"
const password = "REDACTED"
export const transporter = nodemailer.createTransport({
    service: "Gmail",
    host: "smtp.gmail.com",
    // port: 465,
    // secure: true,
    auth: {
        user: email,
        pass: password,
    },
});

