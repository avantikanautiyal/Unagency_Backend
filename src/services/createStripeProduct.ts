import Stripe from "stripe";
import { IPackages } from "../models/packages.model";
const stripe = new Stripe(`${process.env.stripe_secret_key}`);

const createStripeProduct = async (item: IPackages) => {
  const { title, description, price, currency, duration, billingCycle } = item;
  // Create a product
  const product = await stripe.products.create({
    name: title,
    description: description,
  });

  try {
    // Create a price for the product
    const amountInCents = Math.round(price * 100);
    await stripe.prices.create({
      unit_amount: amountInCents,
      currency: currency,
      recurring: {
        interval: billingCycle,
        interval_count: duration,
      },
      product: product.id,
    });
    return product.id;
  } catch (error) {
    if (error && (error as any).type === "StripeInvalidRequestError") {
      try {
        const deletedProduct = await stripe.products.del(product.id);
        console.log("Product deleted due to error:", deletedProduct.id);
      } catch (deleteError) {
        console.error("Error deleting product:", deleteError);
      }
    }
    throw error;
  }
};

export default createStripeProduct;
