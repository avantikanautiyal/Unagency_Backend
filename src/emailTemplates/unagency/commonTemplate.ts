type CommonTemplateProps = {
    name: string;
    content: string;
    title: string;
    buttonText?: string;
    buttonLink?: string;
}

export function commonTemplate(props: CommonTemplateProps = { name: "", content: "", title: "Welcome to UNAGENCY" }) {

    return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${props.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">

    <!-- Main Wrapper Table -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                
                <!-- Container Table (600px width standard for emails) -->
                <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; width: 600px; max-width: 600px; border-collapse: collapse;">
                    
                    <!-- HEADER -->
                    <tr>
                        <td bgcolor="#000000" style="padding: 15px 30px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="left" valign="middle">
                                        <div style="color: #ffffff; font-weight: bold; font-size: 18px; letter-spacing: 1px;">
                                            UNAGENCY
                                            <div style="width: 30px; height: 3px; background-color: #ea1b58; margin-top: 5px;"></div>
                                        </div>
                                    </td>
                                    <td align="right" valign="middle">
                                        <a href="#" style="background-color: #ffffff; color: #000000; text-decoration: none; padding: 8px 15px; font-size: 12px; font-weight: bold; border-radius: 4px; display: inline-block;">Explore Projects</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- HERO SECTION WITH GRADIENT -->
                    <tr>
                        <!-- Fallback background color + Linear Gradient for modern clients -->
                        <td align="center" style="background-color: #b50045; background: linear-gradient(135deg, #ea1b58 0%, #75002b 100%); padding: 60px 40px; color: #ffffff;">
                            <h1 style="margin: 0 0 15px 0; font-size: 32px; font-weight: normal;">${props.title}</h1>
                            <p style="margin: 0; font-size: 16px; opacity: 0.9;">Making ideas look better than you imagined.</p>
                        </td>
                    </tr>

                    <!-- BODY CONTENT -->
                    <tr>
                        <td style="padding: 40px 40px 20px 40px; color: #333333; line-height: 1.6;">
                            <p style="margin: 0 0 20px 0; font-size: 16px;">
                                Hey <span style="color: #ea1b58; font-weight: bold;">${props.name}</span>,
                            </p>
                            <p style="margin: 0 0 30px 0; color: #555555; font-size: 14px;">
                                ${props.content}
                            </p>

                            <!-- FEATURE BOX -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9f9f9; border-radius: 8px; margin-bottom: 30px;">
                                <tr>
                                    <td style="padding: 30px;">
                                        <p style="color: #ea1b58; font-weight: bold; margin: 0 0 20px 0; font-size: 15px;">Here's what's waiting for you:</p>
                                        
                                        <!-- List Item 1 -->
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td width="24" valign="top">
                                                    <div style="width: 20px; height: 20px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 20px; font-size: 12px;">✓</div>
                                                </td>
                                                <td style="padding-left: 10px; font-size: 14px; color: #444444;">
                                                    Access to a full design team under one platform.
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- List Item 2 -->
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td width="24" valign="top">
                                                    <div style="width: 20px; height: 20px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 20px; font-size: 12px;">✓</div>
                                                </td>
                                                <td style="padding-left: 10px; font-size: 14px; color: #444444;">
                                                    Unlimited project briefs under your plan.
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- List Item 3 -->
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 15px;">
                                            <tr>
                                                <td width="24" valign="top">
                                                    <div style="width: 20px; height: 20px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 20px; font-size: 12px;">✓</div>
                                                </td>
                                                <td style="padding-left: 10px; font-size: 14px; color: #444444;">
                                                    Real-time feedback and chat — no endless email threads.
                                                </td>
                                            </tr>
                                        </table>

                                        <!-- List Item 4 -->
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td width="24" valign="top">
                                                    <div style="width: 20px; height: 20px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 20px; font-size: 12px;">✓</div>
                                                </td>
                                                <td style="padding-left: 10px; font-size: 14px; color: #444444;">
                                                    Organized storage for every file and version.
                                                </td>
                                            </tr>
                                        </table>

                                    </td>
                                </tr>
                            </table>

                            <!-- CALL TO ACTION AREA -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center" style="padding-bottom: 20px;">
                                        ${props.buttonText ? `<a href="${props.buttonLink ?? "#"}" style="background-color: #ea1b58; color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 14px;">${props.buttonText}</a>` : ""}
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <!-- Secondary Buttons Table for alignment -->
                                        <table border="0" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding: 0 10px;">
                                                    <a href="${process.env.FRONTEND_URL}/membership" style="background-color: #ffffff; border: 2px solid #ea1b58; color: #ea1b58; text-decoration: none; padding: 10px 25px; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 13px;">View Plans</a>
                                                </td>
                                                <td style="padding: 0 10px;">
                                                    <a href="#" style="background-color: #ffffff; border: 2px solid #ea1b58; color: #ea1b58; text-decoration: none; padding: 10px 25px; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 13px;">Invite Your Team</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- PRE-FOOTER TEXT -->
                            <div style="text-align: center; margin-top: 40px; margin-bottom: 20px; color: #666666; font-size: 13px;">
                                <p style="margin-bottom: 5px; font-weight: bold;">Already have a project idea?</p>
                                <p style="margin: 0;">Jump in, create your first brief, and our team will take it from there.</p>
                            </div>

                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td bgcolor="#000000" align="center" style="padding: 40px 20px;">
                            <div style="color: #ffffff; font-weight: bold; font-size: 16px; margin-bottom: 5px;">UNAGENCY</div>
                            <div style="width: 30px; height: 3px; background-color: #ea1b58; margin-bottom: 15px;"></div>
                            
                            <p style="color: #888888; font-size: 12px; margin: 0 0 10px 0;">&copy; 2025</p>
                            <p style="color: #888888; font-size: 12px; margin: 0 0 20px 0;">Creative without the chaos.</p>

                            <p style="margin: 0 0 20px 0; font-size: 12px;">
                                <a href="#" style="color: #ea1b58; text-decoration: none;">www.unagency.design</a>
                                <span style="color: #444444; margin: 0 10px;">|</span>
                                <a href="#" style="color: #ffffff; text-decoration: none;">Instagram</a>
                                <span style="color: #444444; margin: 0 10px;">|</span>
                                <a href="#" style="color: #ffffff; text-decoration: none;">LinkedIn</a>
                            </p>
                            
                            <div style="border-top: 1px solid #222222; width: 80%; margin: 20px auto;"></div>

                            <p style="color: #666666; font-size: 11px; margin: 0;">Need to take a break?</p>
                            <p style="margin: 5px 0 0 0;">
                                <a href="#" style="color: #444444; font-size: 11px; text-decoration: underline;">Unsubscribe</a>
                            </p>
                        </td>
                    </tr>

                </table>
                <!-- End Container Table -->

            </td>
        </tr>
    </table>

</body>
</html>
    `
}