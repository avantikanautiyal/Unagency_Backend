import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

interface IItem {
  priceId: string;
  customerId: string;
}
const createSession = async (item: IItem) => {
  const { priceId, customerId } = item;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer: customerId,
    billing_address_collection: "required",
    customer_update: {
      address: "auto",
      name: "auto",
    },
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: process.env.FRONTEND_URL + "/payment-success",
    // `http://localhost:5173/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.FRONTEND_URL + "/payment-failure",
    // `http://localhost:5173/payments/failed?session_id={CHECKOUT_SESSION_ID}`,
  });

  return session;
};

export default createSession;
