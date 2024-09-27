import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

interface IItem {
  priceId: string;
  customerId: string;
}
const CreateUserSubscription = async (item: IItem) => {
  const { priceId, customerId } = item;
  const customer = await stripe.customers.retrieve(customerId);

  

  if (customer.deleted) {
    console.log("This customer has been deleted.");
    return;
  } else {
    // TypeScript now knows this is a Customer object and not a DeletedCustomer
    const defaultPaymentMethod =
      customer.invoice_settings?.default_payment_method;

    // const subscription = await stripe.subscriptions.create({
    //     customer: customerId,
    //     items: [
    //       { price: priceId },  // The new subscription price
    //     ],
    //     default_payment_method: defaultPaymentMethod,  // Reuse the saved payment method
    //   });

    console.log("Default payment method:", defaultPaymentMethod, customer);
  }
};

export default CreateUserSubscription;
