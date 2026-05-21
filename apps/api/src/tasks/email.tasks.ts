/**
 * src/tasks/email.tasks.ts
 *
 * Trigger.dev v4 email tasks.
 * All tasks use exponential backoff retry (max 3 attempts).
 *
 * Tasks:
 *   - sendConfirmationEmail  — sends email-confirm link after registration
 *   - sendWelcomeEmail       — sent after admin approves verification
 *   - sendVerificationOutcomeEmail — approved or rejected notification
 */

import { task } from "@trigger.dev/sdk/v3";
import { SignJWT } from "jose";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  sendEmail,
  buildConfirmationEmail,
  buildWelcomeEmail,
  buildVerificationOutcomeEmail,
} from "../services/email/index.js";

// ── Shared Retry Config ───────────────────────────────────────────────────────

const retryConfig = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 1000,
  maxTimeoutInMs: 30_000,
  randomize: true,
};

// ── Task: sendConfirmationEmail ───────────────────────────────────────────────

export interface SendConfirmationEmailPayload {
  userId: string;
  email: string;
  username: string;
}

/**
 * Signs a 1-hour email confirmation JWT and sends it to the user.
 * The confirm endpoint at GET /api/auth/confirm?token=... validates this JWT.
 */
export const sendConfirmationEmail = task({
  id: "send-confirmation-email",
  retry: retryConfig,
  run: async (payload: SendConfirmationEmailPayload) => {
    logger.info(
      { userId: payload.userId, email: payload.email },
      "[Task:sendConfirmationEmail] starting",
    );

    // Sign a short-lived email confirm token.
    const secret = new TextEncoder().encode(env.EMAIL_SECRET);
    const token = await new SignJWT({
      sub: payload.userId,
      email: payload.email,
      purpose: "email-confirm",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    const confirmUrl = `${env.WEB_URL}/confirm?token=${token}`;
    const html = buildConfirmationEmail(confirmUrl);

    await sendEmail({
      to: payload.email,
      subject: "Confirm your Alumni Platform email",
      html,
    });

    logger.info(
      { userId: payload.userId },
      "[Task:sendConfirmationEmail] done",
    );
  },
});

// ── Task: sendWelcomeEmail ────────────────────────────────────────────────────

export interface SendWelcomeEmailPayload {
  userId: string;
  email: string;
  fullName: string;
  networkName: string;
}

/**
 * Sends a welcome email after admin approves the user's verification.
 */
export const sendWelcomeEmail = task({
  id: "send-welcome-email",
  retry: retryConfig,
  run: async (payload: SendWelcomeEmailPayload) => {
    logger.info(
      { userId: payload.userId, email: payload.email },
      "[Task:sendWelcomeEmail] starting",
    );

    const loginUrl = `${env.WEB_URL}/login`;
    const html = buildWelcomeEmail(
      payload.fullName,
      payload.networkName,
      loginUrl,
    );

    await sendEmail({
      to: payload.email,
      subject: `Welcome to ${payload.networkName}! 🎉`,
      html,
    });

    logger.info({ userId: payload.userId }, "[Task:sendWelcomeEmail] done");
  },
});

// ── Task: sendVerificationOutcomeEmail ────────────────────────────────────────

export interface SendVerificationOutcomeEmailPayload {
  userId: string;
  email: string;
  fullName: string;
  approved: boolean;
  reason?: string;
}

/**
 * Sends the verification approved or rejected email to the user.
 */
export const sendVerificationOutcomeEmail = task({
  id: "send-verification-outcome-email",
  retry: retryConfig,
  run: async (payload: SendVerificationOutcomeEmailPayload) => {
    logger.info(
      { userId: payload.userId, approved: payload.approved },
      "[Task:sendVerificationOutcomeEmail] starting",
    );

    const html = buildVerificationOutcomeEmail(
      payload.approved,
      payload.fullName,
      payload.reason,
    );

    const subject = payload.approved
      ? "Your account has been verified! ✅"
      : "Verification update — action required";

    await sendEmail({ to: payload.email, subject, html });

    logger.info(
      { userId: payload.userId, approved: payload.approved },
      "[Task:sendVerificationOutcomeEmail] done",
    );
  },
});
