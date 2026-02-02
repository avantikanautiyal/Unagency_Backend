const UNAGENCY_LOGO = "https://prakriadirect.s3.ap-south-1.amazonaws.com/UNAGENCY%20LOGO.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIA36F4RHHVOACGPFZM%2F20260202%2Fap-south-1%2Fs3%2Faws4_request&X-Amz-Date=20260202T070226Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEBcaCmFwLXNvdXRoLTEiRzBFAiEAqfrC%2BJGuzVxBxEZUcqyibINaCcDcFPLdfYeOL9zfUHoCIF910DHRBnyD6jZRUErL8ydlFN9GKCGqo%2FpdolipgZbuKvgCCOD%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQARoMODIwNzM0MTQ3MDUwIgyI%2FmQCLKUTHhKUOPkqzALDnMRoFF0f0fOsw2CqDvJRGb5PS%2FLqW4AWmH8RA0wNz14lnkjxdN2lRBiSvmlP4q%2BAMQ0ZP38gyoJ%2FhifiYUW7MhLmWuOx%2BB0FkvRpPTtC1daN3tu1kFHcNR6ZOG24Tvg6pBC8Az50E43X%2BFGJ5%2BorVMzrkpsoqZrKFHxWHeGvfhQxWnXneRHpTqKspwcD3h9nLTnhG0C4YPmFh%2BBsB8G8wyCPnmJPONiq%2F7SshgSG5bo4B1nmL1lzQpVLWKp52W41pC%2BOEeguuMwpNJ8DrMfyv8aJB2h62DVHmJ7i32A%2F5AZTLmasUDzpcVqeqaL%2F3ic2aBl%2B1mf8U0zfEqAwU%2FRs54wp2QMuRCNA0MRNmVh7JN2S3BIb3HWuLYahH6E2sTcQOkcO5Sb2hPKYC5Cw0Sl0WLVtC1uhfi1Szl5S1vJ6rmguYlks1XUGvA3eRTC4loHMBjqtAv9lXje8kCpDz9oJMMV%2F27s4%2BPBrsntYDw32KhiOl%2FB8ejq%2B5f1HVqIn1MGRt6XhfOoO4cNP72fhOBgXBOWxQDmLGwJ4zZ166LnhlPCN0UNpyPMiOc9b4394%2FoV4ZeZuUE1DAny8WUrQJil6fcTrXo8gVsexKqhqHrYugELnddqG%2BEv2srHGTmlO6fCmhtJBgiKpgv7IX3o9%2BTCI4wnaCWNSevCNr71%2Fmm9d%2Bwp%2FrhtN2tVJfxf8oEeHMU6zyNKqvakBc28o8yU2lRmfXZOYzKTKSDyyEL11huU8VTLl70RmNyQu6Y%2BS5gFZwPDL8%2BsVnTbJg8eA1%2F9xDN2yk1QOY835FPl6NKjb9c2dxKSgQcGk4pocRg9cRatvTtwwJpLtq9mbmaIMWLLvmyewUaQ%3D&X-Amz-Signature=636393271f1bae51f5d6d558554169671362a5153d0f099fb4efdf69b7160a04&X-Amz-SignedHeaders=host&response-content-disposition=inline";

type CommonTemplateProps = {
    name: string;
    content: string;
    title: string;
    buttonText?: string;
    buttonLink?: string;
    showFeatures?: boolean;
}

export function commonTemplate(props: CommonTemplateProps = { name: "", content: "", title: "Welcome to UNAGENCY", showFeatures: false }) {

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
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; margin: 0; padding: 0;">
        <tr>
            <td align="center">
                
                <!-- Container Table (100% width covering) -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; width: 100%; border-collapse: collapse;">
                    
                    <!-- HEADER -->
                    <tr>
                        <td bgcolor="#000000" style="padding: 15px 40px;">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 800px; margin: 0 auto;">
                                <tr>
                                    <td align="left" valign="middle">
                                        <img src="${UNAGENCY_LOGO}" alt="UNAGENCY" style="display: block; width: 140px; height: auto;">
                                    </td>
                                    <td align="right" valign="middle" style="padding-left: 20px;">
                                        <a href="${process.env.FRONTEND_URL}/categories" style="background-color: #ffffff; color: #000000; text-decoration: none; padding: 8px 15px; font-size: 12px; font-weight: bold; border-radius: 4px; display: inline-block; white-space: nowrap;">Explore Categories</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- HERO SECTION WITH GRADIENT -->
                    <tr>
                        <td align="center" style="background-color: #b50045; background: linear-gradient(135deg, #ea1b58 0%, #75002b 100%); padding: 80px 40px; color: #ffffff;">
                            <div style="max-width: 800px; margin: 0 auto;">
                                <h1 style="margin: 0 0 15px 0; font-size: 36px; font-weight: normal; letter-spacing: -0.5px;">${props.title}</h1>
                                <p style="margin: 0; font-size: 18px; opacity: 0.9;">Making ideas look better than you imagined.</p>
                            </div>
                        </td>
                    </tr>

                    <!-- BODY CONTENT -->
                    <tr>
                        <td align="center" style="padding: 60px 40px; color: #333333; line-height: 1.6;">
                            <div style="max-width: 800px; margin: 0 auto; text-align: left;">
                                <p style="margin: 0 0 20px 0; font-size: 18px;">
                                    Hey <span style="color: #ea1b58; font-weight: bold;">${props.name}</span>,
                                </p>
                                <p style="margin: 0 0 30px 0; color: #555555; font-size: 16px;">
                                    ${props.content}
                                </p>

                                <!-- FEATURE BOX -->
                                ${props.showFeatures ? `
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9f9f9; border-radius: 12px; margin-bottom: 40px;">
                                    <tr>
                                        <td style="padding: 40px;">
                                            <p style="color: #ea1b58; font-weight: bold; margin: 0 0 25px 0; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Here's what's waiting for you:</p>
                                            
                                            <!-- List Item 1 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 18px;">
                                                <tr>
                                                    <td width="28" valign="top">
                                                        <div style="width: 22px; height: 22px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 22px; font-size: 12px;">✓</div>
                                                    </td>
                                                    <td style="padding-left: 12px; font-size: 15px; color: #444444;">
                                                        Access to a full design team under one platform.
                                                    </td>
                                                </tr>
                                            </table>

                                            <!-- List Item 2 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 18px;">
                                                <tr>
                                                    <td width="28" valign="top">
                                                        <div style="width: 22px; height: 22px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 22px; font-size: 12px;">✓</div>
                                                    </td>
                                                    <td style="padding-left: 12px; font-size: 15px; color: #444444;">
                                                        Unlimited project briefs under your plan.
                                                    </td>
                                                </tr>
                                            </table>

                                            <!-- List Item 3 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 18px;">
                                                <tr>
                                                    <td width="28" valign="top">
                                                        <div style="width: 22px; height: 22px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 22px; font-size: 12px;">✓</div>
                                                    </td>
                                                    <td style="padding-left: 12px; font-size: 15px; color: #444444;">
                                                        Real-time feedback and chat — no endless email threads.
                                                    </td>
                                                </tr>
                                            </table>

                                            <!-- List Item 4 -->
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                                <tr>
                                                    <td width="28" valign="top">
                                                        <div style="width: 22px; height: 22px; background-color: #ea1b58; border-radius: 50%; color: #ffffff; text-align: center; line-height: 22px; font-size: 12px;">✓</div>
                                                    </td>
                                                    <td style="padding-left: 12px; font-size: 15px; color: #444444;">
                                                        Organized storage for every file and version.
                                                    </td>
                                                </tr>
                                            </table>

                                        </td>
                                    </tr>
                                </table>
                                ` : ""}

                                <!-- CALL TO ACTION AREA -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td align="center" style="padding-bottom: 30px;">
                                            ${props.buttonText ? `<a href="${props.buttonLink ?? "#"}" style="background-color: #ea1b58; color: #ffffff; text-decoration: none; padding: 18px 40px; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; transition: all 0.3s ease;">${props.buttonText}</a>` : ""}
                                        </td>
                                    </tr>
                                </table>

                                <!-- PRE-FOOTER TEXT -->
                                <div style="text-align: center; margin-top: 50px; color: #666666; font-size: 14px;">
                                    <p style="margin-bottom: 8px; font-weight: bold; color: #333333;">Already have a project idea?</p>
                                    <p style="margin: 0; opacity: 0.8;">Jump in, create your first brief, and our team will take it from there.</p>
                                </div>
                            </div>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td bgcolor="#000000" align="center" style="padding: 60px 40px;">
                            <div style="max-width: 800px; margin: 0 auto;">
                                <img src="${UNAGENCY_LOGO}" alt="UNAGENCY" style="display: block; width: 120px; height: auto; margin: 0 auto 20px auto;">
                                
                                <p style="color: #888888; font-size: 14px; margin: 0 0 10px 0;">&copy; 2025</p>
                                <p style="color: #888888; font-size: 14px; margin: 0 0 30px 0; opacity: 0.6;">Creative without the chaos.</p>

                                <p style="margin: 0 0 30px 0; font-size: 14px;">
                                    <a href="#" style="color: #ea1b58; text-decoration: none; font-weight: bold;">www.unagency.design</a>
                                    <span style="color: #333333; margin: 0 15px;">|</span>
                                    <a href="#" style="color: #ffffff; text-decoration: none; opacity: 0.8;">Instagram</a>
                                    <span style="color: #333333; margin: 0 15px;">|</span>
                                    <a href="#" style="color: #ffffff; text-decoration: none; opacity: 0.8;">LinkedIn</a>
                                </p>
                                
                                <div style="border-top: 1px solid #222222; width: 60px; margin: 30px auto;"></div>

                                <p style="color: #666666; font-size: 12px; margin: 0;">Need to take a break?</p>
                                <p style="margin: 10px 0 0 0;">
                                    <a href="#" style="color: #444444; font-size: 12px; text-decoration: underline;">Unsubscribe</a>
                                </p>
                            </div>
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