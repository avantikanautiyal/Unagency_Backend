import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  priceId: string;
  customerId: string;
}
const stripeSession = async (item: IItem) => {
  const { priceId, customerId } = item;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: "https://prakria-direct-ui-pearl.vercel.app/",
    cancel_url: "https://prakria-direct-ui-pearl.vercel.app/",
  });

  return session;
};

export default stripeSession;
