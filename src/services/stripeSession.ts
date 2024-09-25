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
    success_url: `http://localhost:5173/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `http://localhost:5173/payments/failed?session_id={CHECKOUT_SESSION_ID}`,
  });

  return session;
};

export default stripeSession;
