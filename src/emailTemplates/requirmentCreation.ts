type CustomerInfo = {
    name: string;
    email: string;
}
type ProjectInfo = {
    name: string;
    description: string;
    deadline: string;
}
type RequirmentCreationTemplateProps = {
    name: string;
    customer: CustomerInfo;
    project: ProjectInfo;
}
export function requirmentCreationTemplate({ name, customer, project }: RequirmentCreationTemplateProps) {
    return `
    <!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Requirement Submission - Designzo</title>
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
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .header {
      text-align: center;
      background-color: #4CAF50;
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
      color: #4CAF50;
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
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <h1>Project Requirement Submission</h1>
    </div>
    <div class="content">
      <h2>New Project Requirements</h2>
      <p>Dear ${name} Team,</p>
      <p>We are excited to inform you that we have a new project requirement. Below, you’ll find the key project details
        and requirements to guide the planning and execution process.</p>

      <p><strong>Project Name:</strong> ${project?.name}</p>
      <p><strong>Project Description:</strong> ${project.deadline}</p>
      <p><strong>Timeline:</strong> ${project.deadline}</p>

      <p>Best regards,</p>
      <p>${customer?.name}<br>
        <a href="mailto:${customer?.email}">${customer?.email}</a>
      </p>
    </div>
    <div class="footer">
    </div>
  </div>
</body>

</html>
    `
}