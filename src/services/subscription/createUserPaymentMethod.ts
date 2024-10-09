import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
const createUserPaymentMethod = async (
  customerId: string,
  token: string,
  cardHolder: string
) => {
  const existingPaymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
  });

  const cardCreate = await stripe.customers.createSource(customerId, {
    source: token,
    metadata: {
      cardHolder,
    },
  });

  if (cardCreate.object === "card") {
    const isDuplicate = existingPaymentMethods.data.some((paymentMethod) => {
      const card = paymentMethod.card;
      return card?.fingerprint == (cardCreate?.fingerprint as string); // Compare the fingerprint
    });
    if (isDuplicate) {
      await stripe.customers.deleteSource(customerId, cardCreate.id);
      throw new Error(
        "Duplicate card detected. Payment method already exists."
      );
    }
    const create = await stripe.customers.update(customerId, {
      default_source: cardCreate.id,
    });

    return create;
  }
};

export default createUserPaymentMethod;
