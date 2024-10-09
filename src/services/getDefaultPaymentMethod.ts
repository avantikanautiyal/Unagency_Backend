import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface ICustomer {
  customerId: string;
}
const getDefaultPaymentMethod = async (item: ICustomer) => {
  try {
    const customer = await stripe.customers.retrieve(item.customerId);

    // Check if the customer is deleted
    if ((customer as Stripe.DeletedCustomer).deleted) {
      throw new Error("Customer has been deleted.");
    }
    const activeCustomer = customer as Stripe.Customer;
    const defaultPaymentMethodId =
      activeCustomer.invoice_settings.default_payment_method;

    if (defaultPaymentMethodId) {
      // Retrieve the payment method details
      const paymentMethod = await stripe.paymentMethods.retrieve(
        defaultPaymentMethodId as string
      );
      return paymentMethod;
    } else {
      console.log("No default payment method found for this customer.");
      return null;
    }
  } catch (error) {
    throw error;
  }
};

export default getDefaultPaymentMethod;
