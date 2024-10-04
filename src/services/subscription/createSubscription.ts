import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface IItem {
  priceId: string;
  customerId: string;
}
const CreateSubscription = async (item: IItem) => {
  const { priceId, customerId } = item;
  try {
    const stripeSubscription = await stripe.subscriptions.create({
      payment_behavior: "default_incomplete",
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      automatic_tax: { enabled: false },
    });

    return stripeSubscription;
  } catch (err) {
    throw err;
  }
};

export default CreateSubscription;
