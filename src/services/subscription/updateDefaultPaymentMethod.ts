import Stripe from "stripe";

const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

const updateDefaultPaymentMethod = async (
  customerId: string,
  paymentMethodId: string
) => {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
    console.log(
      `Payment method ${paymentMethodId} set as default for customer ${customerId}.`
    );
  } catch (error: any) {
    console.error(`Failed to update customer: ${error.message}`);
  }
};

export default updateDefaultPaymentMethod;
