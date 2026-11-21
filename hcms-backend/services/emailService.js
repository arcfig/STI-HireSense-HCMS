let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  // Fallback if nodemailer is not yet installed
}

/**
 * Masks an email address for UI display (e.g., "g***r@gmail.com").
 */
function maskEmail(email = '') {
  const trimmed = String(email).trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return trimmed;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}@${domain}`;
}

/**
 * Sends a 6-digit Two-Factor Authentication (2FA) verification code via SMTP.
 * If SMTP credentials (SMTP_USER & SMTP_PASS) are not configured in .env,
 * logs the OTP clearly to the server console and returns `deliveryMode: 'console'`
 * so local development works offline without failing.
 */
async function sendTwoFactorOtp({ toEmail, recipientName, otpCode, purpose = 'login' }) {
  const smtpHost = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpSecure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.SMTP_FROM || (smtpUser ? `"HireSense Security" <${smtpUser}>` : '"HireSense Security" <no-reply@hiresense.site>');

  const actionLabel = purpose === 'enable'
    ? 'enable Two-Factor Authentication (2FA) on your HireSense account'
    : 'complete your sign-in to HireSense';

  const subject = `HireSense Security Code: ${otpCode}`;
  const textBody = [
    `Hello ${recipientName || 'HireSense User'},`,
    '',
    `Use the following 6-digit verification code to ${actionLabel}:`,
    '',
    `    ${otpCode}`,
    '',
    'This code expires in 5 minutes. If you did not request this code, please ignore this email or update your account password.',
    '',
    '— STI HireSense Human Capital Management System'
  ].join('\n');

  const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
      <div style="border-bottom: 2px solid #08612f; padding-bottom: 14px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #08612f; font-size: 20px;">HireSense Security Verification</h2>
      </div>
      <p style="margin: 0 0 14px; font-size: 15px;">Hello <strong>${recipientName || 'HireSense User'}</strong>,</p>
      <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.5;">
        Enter the following 6-digit verification code to ${actionLabel}:
      </p>
      <div style="text-align: center; margin: 22px 0;">
        <span style="display: inline-block; font-family: monospace; font-size: 30px; font-weight: 700; letter-spacing: 8px; padding: 14px 28px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px; color: #08612f;">
          ${otpCode}
        </span>
      </div>
      <p style="margin: 0 0 12px; font-size: 13px; color: #64748b;">
        This code is valid for <strong>5 minutes</strong>. Do not share this code with anyone.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">
        STI HireSense • Automated Security Notification
      </p>
    </div>
  `;

  if (nodemailer && smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody
    });

    return { delivered: true, deliveryMode: 'smtp' };
  }

  // Local / unconfigured SMTP fallback: log clearly so local testing never blocks
  console.log('\n============================================================');
  console.log(`[HireSense 2FA OTP - ${purpose.toUpperCase()}]`);
  console.log(`To:   ${toEmail} (${recipientName || 'User'})`);
  console.log(`Code: ${otpCode} (Expires in 5 minutes)`);
  console.log('Note: Configure SMTP_USER and SMTP_PASS in .env for live email delivery.');
  console.log('============================================================\n');

  return { delivered: true, deliveryMode: 'console' };
}

module.exports = {
  maskEmail,
  sendTwoFactorOtp
};
