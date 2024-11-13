import Stripe from "stripe";

const stripe = new Stripe(`${process.env.stripe_secret_key}`, {
  apiVersion: "2024-06-20", // Ensure you specify the latest API version
});

const InvoiceHistory = async (customerId: string) => {
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 10,
    });
    const invoiceList = invoices?.data?.map((item, index) => {
      return {
        invoice_id: item.id,
        customer_name: item.customer_name,
        customer_email: item.customer_email,
        amount_due: item.amount_due,
        currency: item.currency,
        status: item.status,
        invoice_number: item.number,
        invoice_url: item.hosted_invoice_url,
        invoice_pdf_url: item.invoice_pdf,
        subscription_id: item.subscription,
        line_item: item.lines.data.map((line) => ({
          description: line.description,
          amount: line.amount,
        })),
      };
    });
    return invoiceList;
  } catch (error) {
    throw error;
  }
};

export default InvoiceHistory;
