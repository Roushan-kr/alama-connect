/**
 * src/services/email/index.ts
 *
 * Nodemailer email abstraction.
 * All outgoing emails go through this module. Never create transports elsewhere.
 *
 * In development (no SMTP_USER set): uses Nodemailer's Ethereal test account
 * which captures emails without sending them — logs a preview URL to console.
 *
 * In production: uses SMTP credentials from env (e.g. Gmail, SendGrid, SES).
 */

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

// ── Transporter Singleton ─────────────────────────────────────────────────────

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    // Dev mode: create a throwaway Ethereal account for testing.
    logger.warn(
      "[Email] No SMTP_USER/SMTP_PASS configured — using Ethereal test account. " +
        "Email preview URLs will be logged to console.",
    );
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    logger.info(
      { user: testAccount.user },
      "[Email] Ethereal test account created",
    );
  } else {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

// ── Email Types ───────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. Auto-stripped from HTML if not provided. */
  text?: string;
}

// ── Core Send Function ────────────────────────────────────────────────────────

/**
 * Send a transactional email.
 *
 * @param options - Recipient, subject, and HTML body
 * @throws if the SMTP transport fails after nodemailer retries
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const transport = await getTransporter();

  const info = await transport.sendMail({
    from: env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text ?? options.html.replace(/<[^>]+>/g, ""),
  });

  if (env.NODE_ENV !== "production") {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info({ to: options.to, previewUrl }, "[Email] Preview (Ethereal)");
    }
  }

  logger.debug(
    { to: options.to, subject: options.subject, messageId: info.messageId },
    "[Email] sent",
  );
}

// ── Email Templates ───────────────────────────────────────────────────────────

/**
 * Email confirmation template.
 * @param confirmUrl - Full URL including token, e.g. https://app.alumni.dev/confirm?token=...
 */
export function buildConfirmationEmail(confirmUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; color: #1a1a2e; padding: 32px;">
  <h2>Confirm your email address</h2>
  <p>Click the button below to verify your email and activate your Alumni Platform account.</p>
  <p>
    <a href="${confirmUrl}"
       style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;
              border-radius:6px;text-decoration:none;font-weight:600;">
      Confirm Email
    </a>
  </p>
  <p style="color:#666;font-size:14px;">This link expires in 1 hour. If you did not create an account, ignore this email.</p>
</body>
</html>`;
}

/**
 * Welcome email template — sent after admin verification is approved.
 * @param fullName - User's display name
 * @param networkName - e.g. "Punjab Technical University"
 * @param loginUrl - Link to the login page
 */
export function buildWelcomeEmail(
  fullName: string,
  networkName: string,
  loginUrl: string,
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; color: #1a1a2e; padding: 32px;">
  <h2>Welcome to the Alumni Network, ${fullName}! 🎉</h2>
  <p>Your account for <strong>${networkName}</strong> has been verified and is now active.</p>
  <p>
    <a href="${loginUrl}"
       style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;
              border-radius:6px;text-decoration:none;font-weight:600;">
      Sign in to your account
    </a>
  </p>
</body>
</html>`;
}

/**
 * Verification outcome email template.
 * @param approved - true = approved, false = rejected
 * @param fullName - User's display name
 * @param reason - Rejection reason (only shown when approved = false)
 */
export function buildVerificationOutcomeEmail(
  approved: boolean,
  fullName: string,
  reason?: string,
): string {
  if (approved) {
    return buildWelcomeEmail(fullName, "your network", `${env.WEB_URL}/login`);
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; color: #1a1a2e; padding: 32px;">
  <h2>Verification update for ${fullName}</h2>
  <p>Unfortunately, your verification request was not approved at this time.</p>
  ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
  <p>You may resubmit after 48 hours with updated documents.</p>
  <p style="color:#666;font-size:14px;">Contact your network administrator if you believe this is an error.</p>
</body>
</html>`;
}

/**
 * Send a raw HTML email — used by the campaign task for template-rendered bodies.
 * Reuses the same Nodemailer transporter as sendEmail.
 *
 * @param options - Recipient, subject, and rendered HTML body
 */
export async function sendRaw(options: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
  })
}

