import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface IItem {
  subscriptionId: string;
}
const CancelSubscription = async (item: IItem) => {
  const { subscriptionId } = item;
  try {
    const cancelSubscription = await stripe.subscriptions.cancel(
      subscriptionId
    );
    return cancelSubscription;
  } catch (error) {
    throw error;
  }
};

export default CancelSubscription;
