import { Resend } from 'resend';
import type { ClaimLogRecord } from './claimLogger.js';

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export interface RawSendMailInfo {
  mailOptions?: Record<string, any>;
  resendResponse?: any;
  rawMime?: string;
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
  apiKey?: string | undefined;
  emailFrom?: string | undefined;
  defaultEmailTo?: string | undefined;
}

export function getConfigFromEnv(): NotificationServiceConfig {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.RESEND_FROM_EMAIL?.trim() || process.env.NOTIFICATION_EMAIL_FROM?.trim() || 'onboarding@resend.dev';
  const defaultEmailTo = process.env.NOTIFICATION_EMAIL_TO?.trim() || 'delivered@resend.dev';

  return {
    apiKey,
    emailFrom,
    defaultEmailTo,
  };
}

export class ResendNotificationService implements NotificationService {
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

    const targetRecipient = activeConfig.defaultEmailTo || 'delivered@resend.dev';
    const senderEmail = activeConfig.emailFrom || 'onboarding@resend.dev';
    const formattedFrom = senderEmail.includes('<')
      ? senderEmail
      : `"Meridian Motor Insurance" <${senderEmail}>`;

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

    const mailOptions = {
      from: formattedFrom,
      to: [targetRecipient],
      subject,
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Application-Name': 'Meridian Motor Insurance FNOL Voice Agent',
        'X-Claim-Reference': claimNumber,
      },
    };

    console.log('==================================================');
    console.log('[NotificationService] RESEND EMAIL PAYLOAD (Pre-send):');
    console.log(`- From:    ${mailOptions.from}`);
    console.log(`- To:      ${JSON.stringify(mailOptions.to)}`);
    console.log(`- Subject: ${mailOptions.subject}`);
    console.log('==================================================');

    try {
      if (activeConfig.apiKey) {
        const resend = new Resend(activeConfig.apiKey);

        const response = await resend.emails.send({
          from: mailOptions.from,
          to: mailOptions.to,
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html,
          headers: mailOptions.headers,
        });

        if (response.error) {
          console.error(`[NotificationService] RESEND API ERROR:`, response.error);
          globalNotificationState.latestSendMailInfo = {
            mailOptions,
            resendResponse: response,
            error: response.error.message,
            simulated: false,
            timestamp: new Date().toISOString(),
          };
          return {
            success: false,
            error: response.error.message,
          };
        }

        const messageId = response.data?.id || `resend-${Date.now()}`;

        globalNotificationState.latestSendMailInfo = {
          mailOptions,
          resendResponse: response,
          messageId,
          accepted: [targetRecipient],
          rejected: [],
          envelope: { from: formattedFrom, to: [targetRecipient] },
          response: '200 OK (Resend REST API)',
          simulated: false,
          timestamp: new Date().toISOString(),
        };

        console.log(`[NotificationService] RESEND DISPATCH SUCCESS: id=${messageId}`);

        return {
          success: true,
          messageId,
          simulated: false,
        };
      } else {
        // Simulated / Fallback mode when RESEND_API_KEY is not configured
        const simulatedId = `sim-resend-${claimNumber}`;
        globalNotificationState.latestSendMailInfo = {
          mailOptions,
          messageId: simulatedId,
          accepted: [targetRecipient],
          rejected: [],
          envelope: { from: formattedFrom, to: [targetRecipient] },
          response: '200 OK (Simulated Resend API)',
          simulated: true,
          timestamp: new Date().toISOString(),
        };

        console.log(`[NotificationService] SIMULATED RESEND DISPATCH (No RESEND_API_KEY): id=${simulatedId}`);

        return {
          success: true,
          messageId: simulatedId,
          simulated: true,
        };
      }
    } catch (err: unknown) {
      const errorObj = err as any;
      const errorMsg = errorObj?.message || String(err);
      console.error(`[NotificationService] RESEND DISPATCH UNHANDLED ERROR:`, errorMsg);

      globalNotificationState.latestSendMailInfo = {
        mailOptions,
        error: errorMsg,
        simulated: false,
        timestamp: new Date().toISOString(),
      };

      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}

export function createNotificationService(config?: NotificationServiceConfig): NotificationService {
  return new ResendNotificationService(config);
}
