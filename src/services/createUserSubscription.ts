import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface IItem {
  priceId: string;
  customerId: string;
}
const CreateUserSubscription = async (item: IItem) => {
  const { priceId, customerId } = item;
  try {
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      expand: ["latest_invoice.payment_intent"],
    });
    return stripeSubscription;
  } catch (err) {
    throw err;
  }
};

export default CreateUserSubscription;
