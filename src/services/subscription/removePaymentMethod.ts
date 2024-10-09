import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
const RemoveUserPaymentMethod = async (paymentMethodId: string) => {
  const detach = await stripe.paymentMethods.detach(paymentMethodId);
  return detach;
};

export default RemoveUserPaymentMethod;
