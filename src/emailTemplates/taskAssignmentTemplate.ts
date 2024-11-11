type TaskTemplateProps = {
    title: string;
    name: string;
    description: string;
    priority: string;
    deadline: string;
    assignedBy: string;
}
export function taskAssignTemplate(task: TaskTemplateProps) {
    return `
    <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Task Assigned - Track Your Progress</title>
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
            background-color:#e2343b;
             /* #007bff; */
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
            color: #e2343b;
            margin-top: 0;
        }
        .content p {
            line-height: 1.6;
            font-size: 16px;
            color: #555;
        }
        .content .task-info {
            background-color: #f0f0f0;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
        }
        .task-info p {
            margin: 5px 0;
        }
        .task-info .label {
            font-weight: bold;
            color: #e2343b;
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
            <h1>Task Assigned: ${task.title}</h1>
        </div>
        <div class="content">
            <h2>Hello ${task.name},</h2>
            <p>You have been assigned a new task.</p>
            <p>Please find the details of the task below:</p>

            <div class="task-info">
                <p><span class="label">Task Title:</span> ${task.title}</p>
                <p><span class="label">Description:</span> ${task.description}</p>
                <p><span class="label">Status:</span> ${task.priority}</p>
                <p><span class="label">Due Date:</span> ${task.deadline}</p>
                <p><span class="label">Assigned By:</span> ${task.assignedBy}</p>
            </div>

            <p>To view the task in detail, track your progress, or update the status, click the button below:</p>
            <a href="${"/"}" class="btn">View Task</a>

            <p>If you need any assistance or have questions, feel free to reach out to the team.</p>

            <p>Best regards,</p>
            <p>The Designzo Team</p>
        </div>

        <div class="footer">
            <p>Designzo | [Company Address] | [Website] | [Support Email]</p>
        </div>
    </div>
</body>
</html>

    `
}