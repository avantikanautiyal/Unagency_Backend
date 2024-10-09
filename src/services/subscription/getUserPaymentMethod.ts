import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
const getUserPaymentMethod = async (customerId: string) => {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });

  return paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
};

export default getUserPaymentMethod;
