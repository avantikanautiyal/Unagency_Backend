import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
const MakeUserDefaultPaymentMethod = async (
  customerId: string,
  paymentMethodId: string
) => {
  const attachPM = await stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
  if (attachPM) {
    const update = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return update;
  }
};

export default MakeUserDefaultPaymentMethod;
