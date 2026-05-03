import nodemailer from 'nodemailer';
import { config } from '../../config';

interface ErrorAlertInput {
  to: string[];
  errorMessage: string;
  source: string;
  endpoint?: string;
  aiAnalysis: string;
  aiSuggestion: string;
  level: string;
  timestamp: string;
  smtpConfig?: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassEnc: string;
  };
}

interface DigestInput {
  to: string[];
  errorCount: number;
  criticalCount: number;
  topErrors: Array<{ message: string; count: number; source: string }>;
  trendAnalysis: any;
  period: string;
  smtpConfig?: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassEnc: string;
  };
}

export class EmailService {
  private static createTransport(smtpConfig?: ErrorAlertInput['smtpConfig']) {
    return nodemailer.createTransport({
      host: smtpConfig?.smtpHost || config.smtp.host,
      port: smtpConfig?.smtpPort || config.smtp.port,
      secure: false,
      auth: {
        user: smtpConfig?.smtpUser || config.smtp.user,
        pass: smtpConfig?.smtpPassEnc || config.smtp.pass,
      },
    });
  }

  static async sendErrorAlert(input: ErrorAlertInput): Promise<void> {
    const transporter = this.createTransport(input.smtpConfig);
    const levelColor = input.level === 'FATAL' ? '#dc2626' : '#f59e0b';
    const levelEmoji = input.level === 'FATAL' ? '🔴' : '🟡';

    const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .header { background: ${levelColor}; color: white; padding: 20px; font-size: 18px; font-weight: bold; }
      .content { padding: 24px; }
      .field { margin-bottom: 16px; }
      .label { font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; margin-bottom: 4px; }
      .value { color: #1f2937; line-height: 1.5; }
      .code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 13px; white-space: pre-wrap; overflow-x: auto; }
      .ai-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin: 16px 0; }
      .ai-title { color: #1d4ed8; font-weight: 600; margin-bottom: 8px; }
      .footer { padding: 16px 24px; background: #f8fafc; color: #6b7280; font-size: 12px; text-align: center; }
    </style></head>
    <body>
      <div class="container">
        <div class="header">${levelEmoji} ${input.level} Error Alert</div>
        <div class="content">
          <div class="field">
            <div class="label">Error Message</div>
            <div class="code">${escapeHtml(input.errorMessage)}</div>
          </div>
          <div class="field">
            <div class="label">Source</div>
            <div class="value">${escapeHtml(input.source)}</div>
          </div>
          ${input.endpoint ? `
          <div class="field">
            <div class="label">Endpoint</div>
            <div class="value">${escapeHtml(input.endpoint)}</div>
          </div>` : ''}
          <div class="field">
            <div class="label">Timestamp</div>
            <div class="value">${input.timestamp}</div>
          </div>

          <div class="ai-box">
            <div class="ai-title">🤖 AI Root Cause Analysis (Gemini)</div>
            <div class="value">${escapeHtml(input.aiAnalysis)}</div>
          </div>

          <div class="ai-box">
            <div class="ai-title">💡 Suggested Fix</div>
            <div class="value">${escapeHtml(input.aiSuggestion)}</div>
          </div>
        </div>
        <div class="footer">
          AI Support SaaS — Automated Error Monitoring
        </div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"AI Support Monitor" <${input.smtpConfig?.smtpUser || config.smtp.user}>`,
      to: input.to.join(', '),
      subject: `[${input.level}] ${input.source}: ${input.errorMessage.substring(0, 80)}`,
      html,
    });
  }

  static async sendProjectUpdate(input: {
    to: string[];
    projectName: string;
    updateTitle: string;
    updateContent: string;
    smtpConfig?: { smtpHost: string; smtpPort: number; smtpUser: string; smtpPassEnc: string };
  }): Promise<void> {
    const transporter = this.createTransport(input.smtpConfig);
    const html = `<!DOCTYPE html>
    <html><head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
      .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .header { background: #2563eb; color: white; padding: 20px; }
      .header .label { font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
      .header .project { font-size: 20px; font-weight: bold; }
      .content { padding: 24px; }
      .title { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 16px; }
      .body { color: #374151; line-height: 1.7; white-space: pre-wrap; }
      .footer { padding: 16px 24px; background: #f8fafc; color: #6b7280; font-size: 12px; text-align: center; }
    </style></head>
    <body><div class="container">
      <div class="header">
        <div class="label">Project Update</div>
        <div class="project">${escapeHtml(input.projectName)}</div>
      </div>
      <div class="content">
        <div class="title">${escapeHtml(input.updateTitle)}</div>
        <div class="body">${escapeHtml(input.updateContent)}</div>
      </div>
      <div class="footer">Sent via Techview CRM</div>
    </div></body></html>`;

    await transporter.sendMail({
      from: `"Techview CRM" <${input.smtpConfig?.smtpUser || config.smtp.user}>`,
      to: input.to.join(', '),
      subject: `[${escapeHtml(input.projectName)}] ${escapeHtml(input.updateTitle)}`,
      html,
    });
  }

  static async sendErrorDigest(input: DigestInput): Promise<void> {
    const transporter = this.createTransport(input.smtpConfig);

    const topErrorsHtml = input.topErrors
      .map(
        (e) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.source)}</td>
           <td style="padding:8px;border-bottom:1px solid #e5e7eb">${escapeHtml(e.message)}</td>
           <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${e.count}</td></tr>`
      )
      .join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8fafc; }
      .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      .header { background: #1e40af; color: white; padding: 20px; font-size: 18px; font-weight: bold; }
      .content { padding: 24px; }
      .stat { display: inline-block; text-align: center; margin: 0 20px 16px 0; }
      .stat-value { font-size: 28px; font-weight: bold; color: #1e40af; }
      .stat-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      th { text-align: left; padding: 8px; background: #f8fafc; color: #374151; font-size: 13px; }
      .ai-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin: 16px 0; }
      .footer { padding: 16px 24px; background: #f8fafc; color: #6b7280; font-size: 12px; text-align: center; }
    </style></head>
    <body>
      <div class="container">
        <div class="header">📊 Error Digest — ${input.period}</div>
        <div class="content">
          <div class="stat">
            <div class="stat-value">${input.errorCount}</div>
            <div class="stat-label">Total Errors</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#dc2626">${input.criticalCount}</div>
            <div class="stat-label">Critical</div>
          </div>

          <h3 style="color:#374151">Top Errors</h3>
          <table>
            <tr><th>Source</th><th>Error</th><th>Count</th></tr>
            ${topErrorsHtml}
          </table>

          ${input.trendAnalysis ? `
          <div class="ai-box">
            <h3 style="color:#1d4ed8;margin-top:0">🤖 AI Trend Analysis</h3>
            <p><strong>Patterns:</strong> ${(input.trendAnalysis.patterns || []).join('; ')}</p>
            <p><strong>Risk Level:</strong> ${input.trendAnalysis.riskLevel || 'N/A'}</p>
            <p><strong>Recommendations:</strong></p>
            <ul>${(input.trendAnalysis.recommendations || []).map((r: string) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
          </div>` : ''}
        </div>
        <div class="footer">AI Support SaaS — Automated Error Monitoring</div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"AI Support Monitor" <${input.smtpConfig?.smtpUser || config.smtp.user}>`,
      to: input.to.join(', '),
      subject: `[Error Digest] ${input.errorCount} errors in ${input.period} (${input.criticalCount} critical)`,
      html,
    });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}
