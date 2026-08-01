import nodemailer from 'nodemailer';
import type { ClaimLogRecord } from './claimLogger.js';

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export interface RawSendMailInfo {
  messageId?: string;
  accepted?: any;
  rejected?: any;
  envelope?: any;
  response?: string;
  simulated?: boolean;
  timestamp?: string;
  error?: string;
  code?: string;
  command?: string;
}

export const globalNotificationState: { latestSendMailInfo: RawSendMailInfo | null } = {
  latestSendMailInfo: null,
};

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
  const smtpHost = process.env.SMTP_HOST?.trim() || process.env.SMTP_SERVER?.trim();
  const smtpUser = process.env.SMTP_USER?.trim() || process.env.SMTP_USERNAME?.trim() || process.env.EMAIL_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim() || process.env.SMTP_PASSWORD?.trim() || process.env.EMAIL_PASS?.trim();
  const smtpPortStr = process.env.SMTP_PORT || process.env.EMAIL_PORT;
  const smtpPort = smtpPortStr ? parseInt(smtpPortStr, 10) : 587;
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

  return {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPass,
    smtpSecure,
    emailFrom: process.env.NOTIFICATION_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim() || smtpUser || 'claims@meridianinsurance.com',
    defaultEmailTo: process.env.NOTIFICATION_EMAIL_TO?.trim() || process.env.EMAIL_TO?.trim() || smtpUser || 'customer@example.com',
  };
}

export class NodemailerNotificationService implements NotificationService {
  private config: NotificationServiceConfig;

  constructor(config?: NotificationServiceConfig) {
    this.config = config ?? getConfigFromEnv();
  }

  async sendClaimConfirmation(record: ClaimLogRecord): Promise<NotificationResult> {
    const activeConfig = getConfigFromEnv();
    const claimNumber = record.claimNumber;
    const policyNumber = record.verifiedPolicy?.policyNumber || record.claim.policyNumber || 'N/A';
    const customerName = record.verifiedPolicy?.policyholderName || record.claim.callerName || 'Valued Customer';
    const incidentSummary = record.summary || record.claim.incidentDescription || 'No description provided';
    const timestamp = record.timestamp || new Date().toISOString();

    // Priority for destination address:
    // 1. NOTIFICATION_EMAIL_TO env var (if configured and not default mock)
    // 2. SMTP_USER env var (if NOTIFICATION_EMAIL_TO is omitted/default)
    // 3. customer@example.com fallback
    const targetRecipient = (activeConfig.defaultEmailTo && activeConfig.defaultEmailTo !== 'customer@example.com')
      ? activeConfig.defaultEmailTo
      : (activeConfig.smtpUser || 'customer@example.com');

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
      if (activeConfig.smtpHost && activeConfig.smtpUser && activeConfig.smtpPass) {
        // Real SMTP transport via environment variable credentials
        const transporter = nodemailer.createTransport({
          host: activeConfig.smtpHost,
          port: activeConfig.smtpPort,
          secure: activeConfig.smtpSecure,
          auth: {
            user: activeConfig.smtpUser,
            pass: activeConfig.smtpPass,
          },
          family: 4, // Force IPv4 resolution to prevent ENETUNREACH IPv6 network errors on Railway containers
        } as nodemailer.TransportOptions);

        console.log(`[NotificationService] Attempting Nodemailer sendMail via SMTP host=${activeConfig.smtpHost}:${activeConfig.smtpPort} to=${targetRecipient}`);

        const info = await transporter.sendMail({
          from: activeConfig.emailFrom || activeConfig.smtpUser,
          to: targetRecipient,
          subject,
          text: textContent,
          html: htmlContent,
        });

        globalNotificationState.latestSendMailInfo = {
          messageId: info.messageId,
          accepted: info.accepted,
          rejected: info.rejected,
          envelope: info.envelope,
          response: info.response,
          simulated: false,
          timestamp: new Date().toISOString(),
        };

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
          from: activeConfig.emailFrom,
          to: targetRecipient,
          subject,
          text: textContent,
          html: htmlContent,
        });

        globalNotificationState.latestSendMailInfo = {
          messageId: info.messageId,
          accepted: [targetRecipient],
          rejected: [],
          envelope: info.envelope,
          response: info.response || '250 Simulated OK',
          simulated: true,
          timestamp: new Date().toISOString(),
        };

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
      globalNotificationState.latestSendMailInfo = {
        error: errorObj?.message || String(err),
        code: errorObj?.code,
        command: errorObj?.command,
        response: errorObj?.response,
        simulated: false,
        timestamp: new Date().toISOString(),
      };

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
