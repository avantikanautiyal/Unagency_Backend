type InvitationTemplate = {
    link: string;
    name: string;
    orgnizationName: string;
}

export function invitationTemplate({ link, name, orgnizationName }: InvitationTemplate) {

    return `
    <!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invite Team Members to Your Organization</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f9f9f9;
            color: #333;
            margin: 0;
            padding: 0;
        }
        .container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            background-color: #e2343b;
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
            color: #e2343b;
            font-size: 22px;
        }
        .content p {
            line-height: 1.6;
            font-size: 16px;
        }
        .footer {
            text-align: center;
            padding: 10px;
            font-size: 14px;
            color: #777;
        }
        .btn {
            display: inline-block;
            background-color: #e2343b;
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
            <h1>Welcome to Designzo!</h1>
        </div>
        <div class="content">
            <h2>Invitation to Work Together!</h2>
            <p>
                Dear ${name || "user"}, 
            </p>
<p>You're invited to join <strong>${orgnizationName}</strong>. Work better together by simplifying and organizing your team projects with these collaborative features:
</p>

            
            <ul>
                <li>Schedule events to reach your goals and milestones.</li>
                <li>Set roles for each teammate and see how each of them are doing.</li>
                <li>Track time to optimize how you complete each project.</li>

            </ul>
            <strong>
                Ready to kick off your projects?

            </strong>
            <p>
Click the button below to create an account and start collaborating!
                <a href="${link}" class="btn">Sign up now
</a>
            </p>
            <p>
                If you need any assistance, feel free to reach out to our support team.
            </p>
            <p>
                We’re excited to see how <strong>${orgnizationName}</strong> grows, and we’re here to support you every step of the way!
            </p>
            <p>Best regards,</p>
            <p>
                The Designzo Team <br>
                [Contact Information] <br>
                <a href="[Designzo Website]">Visit Designzo</a>
            </p>
        </div>
        <div class="footer">
            <p>Designzo | [Company Address] | [Website] | [Support Email]</p>
        </div>
    </div>
</body>
</html>
    `
}