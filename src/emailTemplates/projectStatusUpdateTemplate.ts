type ProjectStatusUpdateProps = {
    name: string;
    projectName: string;
    organizationName?: string;
    status: string;
    statusNote?: string;
    link: string;
}

export function projectStatusUpdateTemplate({
    name,
    projectName,
    organizationName,
    status,
    statusNote,
    link
}: ProjectStatusUpdateProps) {
    return `
    <!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Project Status Updated - Designzo</title>
</head>
<body style="margin:0; padding:0; background-color:#f9f9f9; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); overflow:hidden;">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color:#e2343b; padding:20px;">
              <h1 style="color:#ffffff; font-size:24px; margin:0;">Project Status Updated</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:20px;">
              <h2 style="color:#e2343b; font-size:22px; margin-top:0;">Hello ${name || "Customer"},</h2>

              <p style="font-size:16px; line-height:1.6;">
                The status of your project 
                <strong>${projectName}</strong> 
                ${organizationName ? `under <strong>${organizationName}</strong>` : ""} 
                has been updated!
              </p>

              <p style="font-size:16px; line-height:1.6;"><strong>New Status:</strong> ${status}</p>
              ${statusNote ? `<p style="font-size:16px; line-height:1.6;"><strong>Note:</strong> ${statusNote}</p>` : ""}

              <p style="font-size:16px; line-height:1.6;">You can view more details and track ongoing progress through the project chat system.</p>

              <p style="text-align:center;">
                <a href="${link}" style="background-color:#4CAF50; color:#ffffff; padding:12px 24px; text-decoration:none; border-radius:5px; font-size:16px; display:inline-block;">Open Project Chat</a>
              </p>

              <p style="font-size:16px; line-height:1.6;">As always, our team is here to help. Reach out to support if you need any assistance.</p>

              <p style="font-size:16px; line-height:1.6;">Cheers,<br>The Designzo Team</p>

              <p style="font-size:16px; line-height:1.6;"><a href="[Designzo Website]" style="color:#e2343b; text-decoration:none;">Visit Designzo</a></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 10px; font-size:14px; color:#777;">
              Designzo | [Company Address] | [Website] | [Support Email]
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>    
    `
}