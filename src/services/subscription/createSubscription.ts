import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
interface IItem {
  priceId: string;
  customerId: string;
  // paymentMethodId: string | null;
}
const CreateSubscription = async (
  item: IItem
  // isFirstSubscription: boolean
) => {
  const {
    priceId,
    customerId,
    // paymentMethodId
  } = item;
  try {
    const stripeSubscription = await stripe.subscriptions.create({
      payment_behavior: "default_incomplete",
      customer: customerId,
      items: [{ price: priceId }],
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      automatic_tax: { enabled: false },
    });

    const latestInvoice = stripeSubscription.latest_invoice;

    // Check if latestInvoice is an object (and not a string)
    if (typeof latestInvoice !== "string" && latestInvoice?.payment_intent) {
      const paymentIntent = latestInvoice.payment_intent;

      // Check if paymentIntent is an object (not a string)
      if (typeof paymentIntent !== "string") {
        const clientSecret = paymentIntent.client_secret;
        return { stripeSubscription, clientSecret };
      } else {
        throw new Error("Payment intent is a string, not an object.");
      }
    } else {
      throw new Error("Unable to retrieve payment intent.");
    }
  } catch (err) {
    throw err;
  }

  // try {
  //   const subscriptionOptions: any = {
  //     payment_behavior: "default_incomplete",
  //     customer: customerId,
  //     items: [{ price: priceId }],
  //     expand: ["latest_invoice.payment_intent"],
  //     automatic_tax: { enabled: false },
  //   };

  //   // If it's the user's first subscription, do not include a payment method ID
  //   if (isFirstSubscription) {
  //     subscriptionOptions["payment_settings"] = {
  //       save_default_payment_method: "on_subscription",
  //     };
  //   } else {
  //     // Use the previous payment method if it exists
  //     subscriptionOptions["default_payment_method"] = paymentMethodId;
  //   }

  //   const stripeSubscription = await stripe.subscriptions.create(
  //     subscriptionOptions
  //   );

  //   const latestInvoice = stripeSubscription.latest_invoice;

  //   if (typeof latestInvoice !== "string" && latestInvoice?.payment_intent) {
  //     const paymentIntent = latestInvoice.payment_intent;

  //     if (typeof paymentIntent !== "string") {
  //       const clientSecret = paymentIntent.client_secret;
  //       return { stripeSubscription, clientSecret };
  //     } else {
  //       throw new Error("Payment intent is a string, not an object.");
  //     }
  //   } else {
  //     throw new Error("Unable to retrieve payment intent.");
  //   }
  // } catch (err) {
  //   throw err;
  // }
};

export default CreateSubscription;
