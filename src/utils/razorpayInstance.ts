import Razorpay from "razorpay";

const key_id =
  process.env.RAZORPAY_KEY?.trim() ||
  process.env.RAZORPAY_KEY_ID?.trim() ||
  "";
const key_secret =
  process.env.RAZORPAY_SECRET?.trim() ||
  process.env.RAZORPAY_KEY_SECRET?.trim() ||
  "";

const razorpayInstance = new Razorpay({
  key_id,
  key_secret,
});

export default razorpayInstance;
