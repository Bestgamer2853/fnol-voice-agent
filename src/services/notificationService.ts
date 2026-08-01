import nodemailer from 'nodemailer';
import type { ClaimLogRecord } from './claimLogger.js';

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export interface NotificationService {
  sendClaimConfirmation(record: ClaimLogRecord): Promise<NotificationResult>;
}

export interface NotificationServiceConfig {
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
  smtpUser?: string | undefined;
  smtpPass?: string | undefined;
  smtpSecure?: boolean | undefined;
  emailFrom?: string | undefined;
  defaultEmailTo?: string | undefined;
}

export function getConfigFromEnv(): NotificationServiceConfig {
  return {
    smtpHost: process.env.SMTP_HOST?.trim(),
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    smtpUser: process.env.SMTP_USER?.trim(),
    smtpPass: process.env.SMTP_PASS?.trim(),
    smtpSecure: process.env.SMTP_SECURE === 'true',
    emailFrom: process.env.NOTIFICATION_EMAIL_FROM?.trim() || 'claims@meridianinsurance.com',
    defaultEmailTo: process.env.NOTIFICATION_EMAIL_TO?.trim() || 'customer@example.com',
  };
}

export class NodemailerNotificationService implements NotificationService {
  private config: NotificationServiceConfig;

  constructor(config?: NotificationServiceConfig) {
    this.config = config ?? getConfigFromEnv();
  }

  async sendClaimConfirmation(record: ClaimLogRecord): Promise<NotificationResult> {
    const claimNumber = record.claimNumber;
    const policyNumber = record.verifiedPolicy?.policyNumber || record.claim.policyNumber || 'N/A';
    const customerName = record.verifiedPolicy?.policyholderName || record.claim.callerName || 'Valued Customer';
    const incidentSummary = record.summary || record.claim.incidentDescription || 'No description provided';
    const timestamp = record.timestamp || new Date().toISOString();
    const recipientEmail = this.config.defaultEmailTo || 'customer@example.com';

    const subject = `[Meridian Insurance] Claim Confirmation - ${claimNumber}`;

    const textContent = `
Dear ${customerName},

Thank you for contacting Meridian Motor Insurance. Your First Notice of Loss (FNOL) has been recorded successfully.

CLAIM CONFIRMATION DETAILS
----------------------------------------
Claim Number:      ${claimNumber}
Policy Number:     ${policyNumber}
Customer Name:     ${customerName}
Incident Summary:  ${incidentSummary}
Timestamp:         ${timestamp}
----------------------------------------

${record.escalationRequired ? 'URGENT NOTICE: Your claim has been flagged for priority handling by a claims adjuster. Our emergency team will contact you shortly.' : 'Our claims team will review your details and reach out regarding next steps.'}

Best regards,
Meridian Motor Insurance Claims Team
    `.trim();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center; }
    .content { padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0; }
    .field { margin-bottom: 10px; }
    .label { font-weight: bold; color: #475569; }
    .badge { display: inline-block; padding: 4px 8px; background-color: #3b82f6; color: white; border-radius: 4px; font-weight: bold; }
    .urgent-badge { background-color: #ef4444; }
    .footer { font-size: 0.85em; color: #64748b; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h2>Meridian Motor Insurance</h2>
    <p>First Notice of Loss - Claim Confirmation</p>
  </div>
  <div class="content">
    <p>Dear <strong>${customerName}</strong>,</p>
    <p>Thank you for submitting your incident details. Below is your official claim confirmation summary:</p>
    
    <div class="field"><span class="label">Claim Reference Number:</span> <span class="badge ${record.escalationRequired ? 'urgent-badge' : ''}">${claimNumber}</span></div>
    <div class="field"><span class="label">Policy Number:</span> ${policyNumber}</div>
    <div class="field"><span class="label">Customer Name:</span> ${customerName}</div>
    <div class="field"><span class="label">Incident Summary:</span> ${incidentSummary}</div>
    <div class="field"><span class="label">Date & Time Logged:</span> ${timestamp}</div>
    
    ${record.escalationRequired ? '<p style="color: #dc2626; font-weight: bold;">⚠️ URGENT NOTICE: Your claim has been flagged for priority review by a claims adjuster due to severity/injury reports.</p>' : '<p>Our team is reviewing your claim and will be in touch shortly.</p>'}
  </div>
  <div class="footer">
    <p>This is an automated notification from Meridian Motor Insurance. Please do not reply directly to this email.</p>
  </div>
</body>
</html>
    `.trim();

    try {
      if (this.config.smtpHost && this.config.smtpUser && this.config.smtpPass) {
        // Real SMTP transport via environment variable credentials
        const transporter = nodemailer.createTransport({
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          secure: this.config.smtpSecure,
          auth: {
            user: this.config.smtpUser,
            pass: this.config.smtpPass,
          },
          family: 4, // Force IPv4 resolution to prevent ENETUNREACH IPv6 network errors on Railway containers
        } as nodemailer.TransportOptions);

        // Determine destination: NOTIFICATION_EMAIL_TO, or SMTP_USER if default
        const targetRecipient = (this.config.defaultEmailTo && this.config.defaultEmailTo !== 'customer@example.com')
          ? this.config.defaultEmailTo
          : (this.config.smtpUser || recipientEmail);

        console.log(`[NotificationService] Attempting Nodemailer sendMail via SMTP host=${this.config.smtpHost}:${this.config.smtpPort} to=${targetRecipient}`);

        const info = await transporter.sendMail({
          from: this.config.emailFrom || this.config.smtpUser,
          to: targetRecipient,
          subject,
          text: textContent,
          html: htmlContent,
        });

        console.log(`[NotificationService] RAW NODEMAILER SENDMAIL RESULT:`);
        console.log(`- messageId: ${info.messageId}`);
        console.log(`- accepted:  ${JSON.stringify(info.accepted)}`);
        console.log(`- rejected:  ${JSON.stringify(info.rejected)}`);
        console.log(`- envelope:  ${JSON.stringify(info.envelope)}`);
        console.log(`- response:  ${info.response}`);

        return { success: true, messageId: info.messageId, simulated: false };
      } else {
        // Simulated / Fallback email dispatch (for dev, testing, or unconfigured SMTP)
        const jsonTransporter = nodemailer.createTransport({
          jsonTransport: true,
        });

        const info = await jsonTransporter.sendMail({
          from: this.config.emailFrom,
          to: recipientEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });

        console.log(`[NotificationService] SIMULATED NODEMAILER SENDMAIL RESULT (No SMTP credentials in env):`);
        console.log(`- messageId: ${info.messageId}`);
        console.log(`- accepted:  ${JSON.stringify(info.accepted)}`);
        console.log(`- rejected:  ${JSON.stringify(info.rejected)}`);
        console.log(`- envelope:  ${JSON.stringify(info.envelope)}`);
        console.log(`- response:  ${info.response}`);

        return {
          success: true,
          messageId: info.messageId || `sim-${claimNumber}`,
          simulated: true,
        };
      }
    } catch (err: unknown) {
      const errorObj = err as any;
      console.error(`[NotificationService] RAW NODEMAILER SENDMAIL ERROR:`);
      console.error(`- message:      ${errorObj?.message || String(err)}`);
      if (errorObj?.code) console.error(`- code:         ${errorObj.code}`);
      if (errorObj?.command) console.error(`- command:      ${errorObj.command}`);
      if (errorObj?.response) console.error(`- response:     ${errorObj.response}`);
      if (errorObj?.responseCode) console.error(`- responseCode: ${errorObj.responseCode}`);

      return {
        success: false,
        error: errorObj?.message || String(err),
      };
    }
  }
}

export function createNotificationService(config?: NotificationServiceConfig): NotificationService {
  return new NodemailerNotificationService(config);
}
