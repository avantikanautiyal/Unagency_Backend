import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface IItem {
  priceId: string;
  subscriptionId: string;
}
const upgradeSubscription = async (item: IItem) => {
  const { priceId, subscriptionId } = item;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const update = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "always_invoice",
      payment_behavior: "default_incomplete",
      items: [{ price: priceId, id: subscription.items.data[0].id }],
    });
    return update;
  } catch (error) {
    throw error;
  }
};

export default upgradeSubscription;
