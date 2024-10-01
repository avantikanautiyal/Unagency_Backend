import Stripe from "stripe";

const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

const RetrieveSession = async (session_id: string) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      session_id as string
    );
    return session;
  } catch (error) {
    throw error;
  }
};

export default RetrieveSession;
