import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  planId: string;
  subscriptionId: string;
}
const UpdateSubscription = async (item: IItem) => {
  const { planId, subscriptionId } = item;
  try {
    const update = await stripe.subscriptions.update(subscriptionId, {
      items: [{ plan: planId }],
    });
    return update;
  } catch (error) {
    throw error;
  }
};

export default UpdateSubscription;
