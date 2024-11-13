import Stripe from "stripe";
import { IPackages } from "../models/packages.model";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});
const createStripeProduct = async (item: IPackages) => {
  const { title, description, currency, duration } = item;
  const product = await stripe.products.create({
    name: title,
    description: description,
  });

  try {
    const getDurationDataWithStripe = async () => {
      const durationData = [];
      for (let i = 0; i < duration.length; i++) {
        let stripePrice;
        if (duration[i].duration_name === "weekly") {
          stripePrice = { id: null };
        } else if (duration[i].duration_name === "monthly") {
          stripePrice = await stripe.prices.create({
            unit_amount: Math.round(duration[i].price * 100),
            currency: currency,
            recurring: { interval: "month" },
            product: product.id,
            // tax_behavior: "exclusive",
          });
        } else if (duration[i].duration_name === "quarterly") {
          stripePrice = await stripe.prices.create({
            unit_amount: Math.round(duration[i].price) * 100,
            currency: currency,
            recurring: {
              interval: "month",
              interval_count: 3,
            },
            product: product.id,
            // tax_behavior: "exclusive",
          });
        } else if (duration[i].duration_name === "yearly") {
          stripePrice = await stripe.prices.create({
            unit_amount: Math.round(duration[i].price) * 100,
            currency: currency,
            recurring: { interval: "year" },
            product: product.id,
            // tax_behavior: "exclusive",
          });
        } else {
          continue;
        }

        let body = {
          duration_name: duration[i].duration_name,
          price: duration[i].price,
          stripe_price_id: stripePrice.id,
        };

        durationData.push(body);
      }
      return durationData;
    };

    const modifiedDuration = await getDurationDataWithStripe();

    return { productId: product.id, modifiedDuration: modifiedDuration };
  } catch (error) {
    if (error && (error as any).type === "StripeInvalidRequestError") {
      try {
        if (product?.id) {
          const deletedProduct = await stripe.products.del(product.id);
          console.log("Product deleted due to error:", deletedProduct.id);
        } else {
          console.log("Product was not created, no need to delete.");
        }
      } catch (deleteError) {
        console.error("Error deleting product:", deleteError);
      }
    }
    throw error;
  }
};

export default createStripeProduct;
