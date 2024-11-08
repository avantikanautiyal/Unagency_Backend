type ProjectCreationTemplate = {
    link: string;
    name: string;
    orgnizationName?: string;
    projectName: string;
    projectDescription: string;
}
export function projectCreationTemplate({ link, name, orgnizationName, projectName, projectDescription }: ProjectCreationTemplate) {

    return `
    <!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Project Created - Track Your Progress on Designzo</title>
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
            color: #ffffff;
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
            background-color: #4CAF50;
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
            <h1>Your New Project on Designzo</h1>
        </div>
        <div class="content">
            <h2>New Project Created - Track Your Progress!</h2>
            <p>Dear ${name || "Customer"},</p>
            <p>We are excited to let you know that a new project has been successfully created for you ${!!orgnizationName ? `on <strong>${orgnizationName}</strong>` : ""} . You can now start tracking your project directly through our chat system, where you'll have access to key updates and performance metrics.</p>
            
            <p><strong>Project Name:</strong> ${projectName}</p>
            <p><strong>Project Description:</strong> ${projectDescription}</p>
            
            <p>Here’s how you can track your project:</p>
            <ul>
                <li><strong>Track Progress:</strong> Stay up-to-date with real-time progress updates in the chat system.</li>
                <li><strong>Monitor Delivery Rate:</strong> View detailed delivery rates and how your project is progressing towards completion.</li>
                <li><strong>Collaborate with Your Team:</strong> Communicate directly with your team through the chat to ensure smooth collaboration and timely delivery.</li>
            </ul>
            
            <p><strong>Next Steps:</strong> To start tracking your project, simply click the button below to access the chat system where you can manage your project details, monitor progress, and engage with your team.</p>
            <a href="${link}" class="btn">Access Your Project Chat</a>
            
            <p>If you have any questions or need assistance, our support team is ready to help you at any time. We’re here to make sure your project runs smoothly from start to finish!</p>
            
            <p>We look forward to helping you achieve great results with Designzo!</p>
            
            <p>Best regards,</p>
            <p>The Designzo Team</p>
            <p><a href="[Designzo Website]">Visit Designzo</a></p>
        </div>
        <div class="footer">
            <p>Designzo | [Company Address] | [Website] | [Support Email]</p>
        </div>
    </div>
</body>
</html>
    `
}