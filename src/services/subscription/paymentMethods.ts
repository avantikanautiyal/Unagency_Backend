import Stripe from "stripe";

const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

const PaymentMethods = async (customerId: string) => {
  try {
    // Retrieve the list of payment methods for the customer
    const paymentMethods = await stripe.customers.listPaymentMethods(
      customerId
    );

    // Retrieve the customer data to get the default payment method
    const customer = await stripe.customers.retrieve(customerId);

    // Check if the customer is deleted
    if ((customer as Stripe.DeletedCustomer).deleted) {
      throw new Error("Customer has been deleted");
    }

    // If the customer is not deleted, access invoice settings
    const defaultPaymentMethod = (customer as Stripe.Customer).invoice_settings
      ?.default_payment_method;

    // Return the payment methods along with the default payment method
    return {
      paymentMethods: paymentMethods?.data, // return the array of payment methods
      defaultPaymentMethod, // return the default payment method
    };
  } catch (error) {
    throw error;
  }
};

export default PaymentMethods;
