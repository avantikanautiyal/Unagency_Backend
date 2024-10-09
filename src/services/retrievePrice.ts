import Stripe from "stripe";
const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

interface IItem {
  priceId: string;
}
const RetrievePriceAndProduct = async (item: IItem) => {
  const { priceId } = item;
  const price = await stripe.prices.retrieve(priceId);
  const product = await stripe.products.retrieve(price?.product as string);
  return { price, product };
};

export default RetrievePriceAndProduct;
