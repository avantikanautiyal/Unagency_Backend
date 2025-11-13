import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "https://api.razorpay.com",
  auth: {
    username: "REDACTED",
    password: "REDACTED",
  },
});

export async function createSubscription(body: any) {
  const response = await axiosInstance.post("/v1/subscriptions", body);

  return response.data;
}
