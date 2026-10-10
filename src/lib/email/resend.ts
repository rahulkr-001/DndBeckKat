import { Resend } from "resend";
export interface SendOtpEmailParams {
to: string;
name?: string;
otp: string;
role: string;
purpose: "INVITATION" | "LOGIN";
}
export async function sendOtpEmail({
to,
name,
otp,
role,
purpose = "INVITATION",
}: SendOtpEmailParams): Promise<{
success: boolean;
data?: any;
error?: string;
}> {
try {
const resendApiKey = process.env.RESEND_API_KEY;
if (!resendApiKey) {
  console.warn(
    "OTP email not sent: RESEND_API_KEY is not configured."
  );

  return {
    success: false,
    error: "Email service is not configured. Please try again later.",
  };
}

const resend = new Resend(resendApiKey);
const from =
  process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

const recipientName = name || "Team Member";

const title =
  purpose === "INVITATION"
    ? `Welcome to Dandiya Night 3.0 Team (${role})`
    : "Your Dandiya Night 3.0 Verification Code";

const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
  </head>
  <body style="font-family: Arial, sans-serif; background-color: #090308; color: #ffffff; padding: 24px; margin: 0;">
    <div style="max-width: 540px; margin: 0 auto; background: #120719; border: 1px solid #D4AF37; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #D4AF37; font-size: 24px; margin: 0 0 8px 0; font-family: serif;">Dandiya Night 3.0</h1>
        <p style="color: #FFE4E8; font-size: 13px; margin: 0; text-transform: uppercase; letter-spacing: 2px;">नाचेगा KATORIA एक साथ • Starlight Club</p>
      </div>

      <div style="border-top: 1px solid rgba(212, 175, 55, 0.3); border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding: 20px 0; margin-bottom: 24px;">
        <p style="font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${recipientName}</strong>,</p>
        <p style="font-size: 14px; color: #E0D5C1; line-height: 1.6; margin: 0;">
          You have been provisioned with the <strong>${role}</strong> role on the Dandiya Night 3.0 Administrative Portal. Use the one-time verification code below to verify your account or log in:
        </p>

        <div style="background: #1A0B2E; border: 2px dashed #D4AF37; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #F7E7A9; font-family: monospace;">${otp}</span>
          <p style="color: #A0A0A0; font-size: 11px; margin: 8px 0 0 0;">Valid for 10 minutes. Never share this code with anyone.</p>
        </div>
      </div>

      <div style="font-size: 12px; color: #888888; text-align: center;">
        <p style="margin: 0;">Indira Garden, Katoria • 19 October 2026</p>
        <p style="margin: 4px 0 0 0;">If you did not request this invitation, please ignore this email.</p>
      </div>
    </div>
  </body>
  </html>
`;

const { data, error } = await resend.emails.send({
  from,
  to,
  subject: `[Dandiya Night 3.0] ${title} - Verification Code: ${otp}`,
  html: htmlContent,
});

if (error) {
  console.warn("Resend API returned an error:", error.message);
  return { success: false, error: error.message };
}

return { success: true, data };

} catch (err: unknown) {
const message =
err instanceof Error ? err.message : "Unknown email service error";
console.warn("Resend sendOtpEmail exception:", message);

return { success: false, error: message };

}
}
