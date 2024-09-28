import Stripe from "stripe";
import StripeCustomers from "../models/customer.model";

const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface StripeCustomerParams {
  name: string;
  email: string;
}

const CreateStripeCustomer = async ({ name, email }: StripeCustomerParams) => {
  try {
    let customerRecord = await StripeCustomers.findOne({ email: email });
    let customerId;
    if (customerRecord) {
      customerId = customerRecord.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({ email: email });
      console.log(customer);
      customerRecord = await StripeCustomers.create({
        name: name,
        email: email,
        stripeCustomerId: customer.id,
      });
      customerId = customer.id;
    }
    return customerId;
  } catch (error) {
    throw error;
  }
};

export default CreateStripeCustomer;
