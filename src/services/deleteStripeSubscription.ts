import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  subscriptionId: string;
}
const DeleteSubscription = async (item: IItem) => {
  const { subscriptionId } = item;
  try {
    const cancelSubscription = await stripe.subscriptions.cancel(subscriptionId);
    return cancelSubscription;
  } catch (error) {
    throw error;
  }
};

export default DeleteSubscription;
