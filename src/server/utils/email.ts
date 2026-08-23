/**
 * Email Service — sends notification emails via Nodemailer (Gmail SMTP).
 *
 * Environment variables needed:
 *   SMTP_HOST (default: smtp.gmail.com)
 *   SMTP_PORT (default: 587)
 *   SMTP_USER (gmail address)
 *   SMTP_PASS (gmail app password — NOT regular password)
 *   SMTP_FROM (display name + email, default: "Construction Manager <noreply@cm.app>")
 *
 * If SMTP_USER is not set, emails are skipped (non-blocking) — useful for dev.
 */
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    // Email not configured — skip silently
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM || "Construction Manager <noreply@construction-manager.app>";

/**
 * Escape user-controlled values before interpolating them into HTML email
 * templates. Prevents HTML/script injection in email clients.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send an email. Non-blocking — errors are logged but don't throw.
 * Returns true if sent, false if skipped or failed.
 */
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string; encoding?: string }[];
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.log("[email] SMTP not configured — skipping email to:", params.to);
    return false;
  }

  try {
    const info = await t.sendMail({
      from: FROM,
      to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || params.html.replace(/<[^>]*>/g, ""),
      attachments: params.attachments,
    });
    console.log("[email] Sent:", info.messageId, "to:", params.to);
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err);
    return false;
  }
}

/**
 * Send a notification email to a user.
 * Looks up the user's email from the database.
 */
export async function notifyUserEmail(params: {
  userId: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  // Dynamic import to avoid circular dependency
  const { db } = await import("@/lib/db");
  const user = await db.user.findUnique({
    where: { id: params.userId },
    select: { email: true, name: true },
  });
  if (!user) return false;

  return sendEmail({
    to: user.email,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}

/**
 * Email templates — HTML formatted with the app's design language.
 */
export const emailTemplates = {
  rfiSubmitted: (rfiNumber: string, subject: string, projectName: string, assignedTo?: string) => ({
    subject: `RFI ${rfiNumber} — Action Required`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">RFI ${escapeHtml(rfiNumber)}</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)}</p>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
          <p style="font-size: 14px; color: #374151;">A new RFI has been submitted and requires your response${assignedTo ? `, ${escapeHtml(assignedTo)}` : ""}.</p>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #059669; margin: 15px 0;">
            <p style="margin: 0; font-weight: 600; font-size: 14px;">${escapeHtml(subject)}</p>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Please log in to the Construction Manager app to review and respond.</p>
        </div>
      </div>
    `,
  }),

  dailyReportSubmitted: (reportNumber: string, reportDate: string, projectName: string) => ({
    subject: `Daily Report ${reportNumber} — Submitted for Review`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">${escapeHtml(reportNumber)}</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)} — ${escapeHtml(reportDate)}</p>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
          <p style="font-size: 14px; color: #374151;">A daily report has been submitted and is ready for your review.</p>
          <p style="font-size: 13px; color: #6b7280;">Please log in to review, approve, or request changes.</p>
        </div>
      </div>
    `,
  }),

  letterOverdue: (ourRef: string, subject: string, daysOverdue: number, projectName: string) => ({
    subject: `⚠️ Letter ${ourRef} — ${daysOverdue} Days Overdue for Reply`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">⚠️ Overdue Letter</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)}</p>
        </div>
        <div style="background: #fef2f2; padding: 20px; border: 1px solid #fecaca; border-radius: 0 0 8px 8px;">
          <p style="font-size: 14px; color: #991b1b;">Letter <strong>${escapeHtml(ourRef)}</strong> is <strong>${escapeHtml(daysOverdue)} days overdue</strong> for a reply.</p>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626; margin: 15px 0;">
            <p style="margin: 0; font-weight: 600; font-size: 14px;">${escapeHtml(subject)}</p>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Please log in and update the reply status immediately.</p>
        </div>
      </div>
    `,
  }),

  lowStockAlert: (materialName: string, currentStock: number, unit: string, reorderLevel: number, projectName: string) => ({
    subject: `📦 Low Stock Alert — ${materialName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">📦 Low Stock Alert</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)}</p>
        </div>
        <div style="background: #fffbeb; padding: 20px; border: 1px solid #fde68a; border-radius: 0 0 8px 8px;">
          <p style="font-size: 14px; color: #92400e;"><strong>${escapeHtml(materialName)}</strong> is below the reorder level.</p>
          <div style="display: flex; gap: 20px; margin: 15px 0;">
            <div style="background: white; padding: 10px 20px; border-radius: 6px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${escapeHtml(currentStock)}</div>
              <div style="font-size: 11px; color: #6b7280;">Current Stock (${escapeHtml(unit)})</div>
            </div>
            <div style="background: white; padding: 10px 20px; border-radius: 6px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${escapeHtml(reorderLevel)}</div>
              <div style="font-size: 11px; color: #6b7280;">Reorder Level (${escapeHtml(unit)})</div>
            </div>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Please initiate procurement to avoid stock-out.</p>
        </div>
      </div>
    `,
  }),

  ipcCertified: (ipcNumber: string, netPayable: number, projectName: string) => ({
    subject: `IPC ${ipcNumber} — Certified for Payment`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #059669; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">IPC ${escapeHtml(ipcNumber)}</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)}</p>
        </div>
        <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
          <p style="font-size: 14px; color: #374151;">Interim Payment Certificate has been certified.</p>
          <div style="background: white; padding: 15px; border-radius: 6px; text-align: center; margin: 15px 0;">
            <div style="font-size: 28px; font-weight: bold; color: #059669;">NPR ${netPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
            <div style="font-size: 12px; color: #6b7280;">Net Payable</div>
          </div>
          <p style="font-size: 13px; color: #6b7280;">Please process payment as per contract terms.</p>
        </div>
      </div>
    `,
  }),

  projectOrder: (orderTitle: string, orderText: string, projectName: string, issuedBy: string) => ({
    subject: `📢 Project Order — ${orderTitle}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1e3a8a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 20px;">📢 Project Order</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(projectName)} — Issued by ${escapeHtml(issuedBy)}</p>
        </div>
        <div style="background: #eff6ff; padding: 20px; border: 1px solid #bfdbfe; border-radius: 0 0 8px 8px;">
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #1e3a8a; margin: 0 0 15px;">
            <p style="margin: 0; font-weight: 600; font-size: 15px;">${escapeHtml(orderTitle)}</p>
          </div>
          <p style="font-size: 14px; color: #374151; white-space: pre-wrap;">${escapeHtml(orderText)}</p>
          <p style="font-size: 13px; color: #6b7280; margin-top: 20px;">This is an official project order. Please acknowledge receipt in the app.</p>
        </div>
      </div>
    `,
  }),
};
