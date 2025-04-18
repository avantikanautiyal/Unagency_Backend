

type WelcomeTemplateProps = {
    customerName: string;
    planName: string;
    startDate: string;
    BillingCycle: string;
    nextRenualDate: string;
    price: string;
}
export function welcomeSubscriptionTemplate(props: WelcomeTemplateProps) {
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Your New Subscription Plan!</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f4f7fa;
            color: #333;
            margin: 0;
            padding: 0;
        }
        .container {
            width: 100%;
            max-width: 650px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            background-color: #000;
            color: #ffffff;
            padding: 15px 0;
            border-radius: 8px 8px 0 0;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .content {
            padding: 20px;
        }
        .content h2 {
            font-size: 22px;
            color: #000;
            margin-top: 0;
        }
        .content p {
            line-height: 1.6;
            font-size: 16px;
            color: #555;
        }
        .content .plan-info {
            background-color: #f0f0f0;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .plan-info p {
            margin: 5px 0;
        }
        .plan-info .label {
            font-weight: bold;
            color: #000;
        }
        .footer {
            text-align: center;
            padding: 10px;
            font-size: 14px;
            color: #777;
            margin-top: 20px;
        }
        .btn {
            display: inline-block;
            background-color: #000;
            color: #ffffff;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Your New Subscription, ${props.customerName}!</h1>
        </div>
        <div class="content">
            <h2>Hello ${props.customerName},</h2>
            <p>Thank you for subscribing to our services! 🎉 We're excited to have you on board and are here to make sure you get the most out of your new subscription.</p>

            <p>You have successfully enrolled in our <strong>${props.planName}</strong> plan. Below are the details of your plan:</p>

            <div class="plan-info">
                <p><span class="label">Plan Name:</span> ${props.planName}</p>
                <p><span class="label">Subscription Start Date:</span> ${props.startDate}</p>
                <p><span class="label">Billing Cycle:</span> ${props.BillingCycle}</p>
                <p><span class="label">Next Renewal Date:</span> ${props.nextRenualDate}</p>
                <p><span class="label">Price:</span> ${props.price}</p>
            </div>

            <p>As part of your plan, you'll enjoy exclusive benefits such as:</p>
            <ul>
                <li>Access to premium features</li>
                <li>Priority support</li>
                <li>Special offers and discounts</li>
                <li>... and much more!</li>
            </ul>

            <p>To access your account and start exploring all the features available in your plan, click the button below:</p>
            <a href="${process.env.FRONTEND_URL}" class="btn">Access Your Account</a>

            <p>If you have any questions or need assistance, our support team is here to help!</p>

            <p>Best regards,</p>
            <p>The [Company Name] Team</p>
        </div>

        <div class="footer">
            <p>[Company Name] | [Company Address] | [Website] | [Support Email]</p>
        </div>
    </div>
</body>
</html>
    `
}