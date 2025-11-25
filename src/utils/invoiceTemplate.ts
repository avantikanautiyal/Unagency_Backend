
export interface InvoiceData {
    payment: any;
    subscription: any;
    user?: any;
}

export function InvoiceHTMLTemplate({ payment, subscription, user }: InvoiceData) {
    const invoiceId = payment.id || "N/A"; // Using Payment ID as requested
    const date = new Date(payment.created_at * 1000).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    const status = payment.status;

    // Robust customer details fallback
    const customerName = user?.name || payment.card?.name || payment.email || "Customer";
    const customerEmail = payment.email || user?.email || "";
    const customerContact = payment.contact || user?.contact || "";

    const orderId = subscription.razorpay_subscription_id?.subscriptionId || payment.order_id || "N/A"; // Using Subscription ID as requested
    const paymentMethod = payment.method === "card" ? `${payment.card?.network} ending in ${payment.card?.last4}` : payment.method;

    // Extract plan details from subscription
    const planName = subscription.razorpay_subscription_id?.planId?.razorpayPlanItem?.item?.name || "Plan";
    const planDescription = subscription.razorpay_subscription_id?.planId?.razorpayPlanItem?.item?.description || "";
    const planId = subscription.razorpay_subscription_id?.planId?.razorpayPlanItem?.id || "N/A";
    const amount = (payment.amount / 100).toFixed(2);
    const subtotal = amount;
    const tax = (payment.tax / 100).toFixed(2);
    const total = amount; // Assuming amount is total paid

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice - ${customerName}</title>
    <style>
        /* Print-specific resets */
        @media print {
            body { 
                background-color: white !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
            }
            .page-container { 
                box-shadow: none !important; 
                margin: 0 !important; 
                width: 100% !important; 
            }
            @page { 
                margin: 0; 
                size: A4; 
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #e2e8f0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

    <!-- A4 Paper Representation -->
    <div class="page-container" style="width: 210mm; min-height: 297mm; margin: 40px auto; background-color: #ffffff; padding: 15mm 15mm; box-shadow: 0 10px 30px rgba(0,0,0,0.1); box-sizing: border-box; position: relative;">

        <!-- Header Section -->
        <table style="width: 100%; margin-bottom: 40px; border-collapse: collapse;">
            <tr>
                <td valign="top">
                    <!-- Placeholder for Logo -->
                    <div style="font-size: 28px; font-weight: 800; color: #1a202c; letter-spacing: -0.5px; text-transform: uppercase;">
                        UNAGENCY
                    </div>
                 <!--   <p style="margin: 5px 0 0; color: #718096; font-size: 14px;">
                        Tax ID: GSTIN123456789<br>
                        123 Business Rd, Tech City, India
                    </p> -->
                </td>
                <td align="right" valign="top">
                    <h1 style="margin: 0; font-size: 42px; font-weight: 300; color: #cbd5e0; text-transform: uppercase; letter-spacing: 2px;">Invoice</h1>
                    <table style="margin-top: 15px; border-collapse: collapse;">
                        <tr>
                            <td style="text-align: right; padding-right: 15px; font-size: 13px; font-weight: 600; color: #718096; text-transform: uppercase;">Payment ID</td>
                            <td style="text-align: right; font-size: 14px; font-weight: 700; color: #2d3748;">${invoiceId}</td>
                        </tr>
                        <tr>
                            <td style="text-align: right; padding-right: 15px; font-size: 13px; font-weight: 600; color: #718096; text-transform: uppercase;">Date</td>
                            <td style="text-align: right; font-size: 14px; font-weight: 600; color: #2d3748;">${date}</td>
                        </tr>
                        <tr>
                            <td style="text-align: right; padding-right: 15px; font-size: 13px; font-weight: 600; color: #718096; text-transform: uppercase;">Status</td>
                            <td style="text-align: right;">
                                <span style="background-color: #def7ec; color: #03543f; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${status}</span>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- Client & Order Info -->
        <div style="margin-bottom: 40px; border-top: 2px solid #edf2f7; border-bottom: 2px solid #edf2f7; padding: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td valign="top" width="50%">
                        <p style="margin: 0 0 8px; font-size: 11px; font-weight: 700; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</p>
                        <h3 style="margin: 0; font-size: 18px; color: #2d3748;">${customerName}</h3>
                        <p style="margin: 4px 0 0; color: #4a5568; font-size: 14px;">
                            ${customerEmail}<br>
                            ${customerContact}
                        </p>
                    </td>
                    <td valign="top" width="50%" style="padding-left: 20px;">
                        <p style="margin: 0 0 8px; font-size: 11px; font-weight: 700; color: #a0aec0; text-transform: uppercase; letter-spacing: 0.5px;">Subscription Details</p>
                        <p style="margin: 0; color: #4a5568; font-size: 14px;">
                            <strong>Subscription ID:</strong> ${orderId}<br>
                            <strong>Payment Method:</strong> ${paymentMethod}
                        </p>
                    </td>
                </tr>
            </table>
        </div>

        <!-- Line Items -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
                <tr style="background-color: #f7fafc;">
                    <th style="text-align: left; padding: 12px 15px; font-size: 12px; font-weight: 700; color: #4a5568; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">Description</th>
                    <th style="text-align: left; padding: 12px 15px; font-size: 12px; font-weight: 700; color: #4a5568; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">Plan Type</th>
                    <th style="text-align: right; padding: 12px 15px; font-size: 12px; font-weight: 700; color: #4a5568; text-transform: uppercase; border-bottom: 1px solid #e2e8f0;">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td style="padding: 15px; border-bottom: 1px solid #edf2f7; color: #2d3748; font-size: 14px;">
                        <strong style="display: block; font-size: 15px; margin-bottom: 2px;">${planName}</strong>
                        <span style="color: #718096; font-size: 12px;">Plan ID: ${planId}</span>
                    </td>
                    <td style="padding: 15px; border-bottom: 1px solid #edf2f7; color: #4a5568; font-size: 14px;">${subscription.razorpay_subscription_id?.planId?.razorpayPlanItem?.period || "Monthly"}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #edf2f7; text-align: right; font-weight: 600; color: #2d3748; font-size: 15px;">&#8377;${amount}</td>
                </tr>
            </tbody>
        </table>

        <!-- Totals -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 50px;">
            <tr>
                <td width="60%"></td>
                <td width="40%">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #718096; font-size: 14px;">Subtotal</td>
                            <td style="padding: 8px 0; text-align: right; color: #2d3748; font-size: 14px; font-weight: 600;">&#8377;${subtotal}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #718096; font-size: 14px;">Tax</td>
                            <td style="padding: 8px 0; text-align: right; color: #2d3748; font-size: 14px; font-weight: 600;">&#8377;${tax}</td>
                        </tr>
                        <tr>
                            <td style="padding: 15px 0; border-top: 2px solid #2d3748; color: #2d3748; font-size: 16px; font-weight: 700;">Total</td>
                            <td style="padding: 15px 0; border-top: 2px solid #2d3748; text-align: right; color: #2d3748; font-size: 20px; font-weight: 800;">&#8377;${total}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- Footer -->
        <div style="position: absolute; bottom: 15mm; left: 15mm; right: 15mm; border-top: 1px solid #edf2f7; padding-top: 20px; text-align: center;">
            <p style="margin: 0; color: #718096; font-size: 13px;">
                <strong>Thank you for your business!</strong><br>
                For any queries regarding this invoice, please contact support at tech@prakria.com
            </p>
        </div>

    </div>

</body>
</html>
    `;
}