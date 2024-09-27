import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  priceId: string;
  subscriptionId: string;
}
const UpdateSubscription = async (item: IItem) => {
  const { priceId, subscriptionId } = item;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const update = await stripe.subscriptions.update(subscriptionId, {
      items: [{ price: priceId, id: subscription.items.data[0].id }],
    });
    return update;
  } catch (error) {
    throw error;
  }
};

export default UpdateSubscription;
