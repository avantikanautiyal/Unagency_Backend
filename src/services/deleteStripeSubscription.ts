import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  subscriptionId: string;
}
const DeleteSubscription = async (item: IItem) => {
  const { subscriptionId } = item;
  try {
    const update = await stripe.subscriptions.cancel(subscriptionId);
    return update;
  } catch (error) {
    throw error;
  }
};

export default DeleteSubscription;
