/**
 * src/tasks/notification.tasks.ts
 *
 * Trigger.dev v4 notification tasks (Phase 1 subset).
 *
 * Tasks:
 *   - notifyAdminNewVerification  — alert network admins when user submits verification
 *   - notifyUserVerificationOutcome — in-app + email when admin approves/rejects
 *
 * Full notification tasks (post_liked, mentioned, connection_accepted, etc.)
 * are implemented in Phase 2+.
 */

import { task } from "@trigger.dev/sdk/v3";
import { db } from "../config/db.js";
import { logger } from "../config/logger.js";
import { redisPublish } from "../config/redis.js";
import { sendVerificationOutcomeEmail } from "./email.tasks.js";

const retryConfig = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 1000,
  maxTimeoutInMs: 30_000,
  randomize: true,
};

// ── Task: createInAppNotification (shared helper for Phase 2+ events) ─────────

export interface CreateInAppNotificationPayload {
  userId: string
  networkId?: string
  type:
    | "POST_LIKED"
    | "POST_COMMENTED"
    | "POST_MENTIONED"
    | "CONNECTION_REQUEST"
    | "CONNECTION_ACCEPTED"
    | "GROUP_ADDED"
    | "NEW_MESSAGE"
    | "ACCOUNT_VERIFIED"
    | "ACCOUNT_REJECTED"
    | "ANNOUNCEMENT"
    | "NEWSLETTER"
  relatedId?: string
  message: string
  link?: string
}

/**
 * Creates an in-app notification row and publishes to Redis for real-time delivery.
 */
export const createInAppNotification = task({
  id: "create-in-app-notification",
  retry: retryConfig,
  run: async (payload: CreateInAppNotificationPayload) => {
    await db.notification.create({
      data: {
        userId: payload.userId,
        networkId: payload.networkId ?? null,
        type: payload.type,
        relatedId: payload.relatedId ?? null,
        message: payload.message,
        link: payload.link ?? null,
      },
    })

    await redisPublish(`user:${payload.userId}:notif`, {
      type: payload.type,
      message: payload.message,
      link: payload.link ?? null,
      relatedId: payload.relatedId ?? null,
    })
  },
})

// ── Task: notifyAdminNewVerification ─────────────────────────────────────────

export interface NotifyAdminNewVerificationPayload {
  reqId: string;
  networkId: string;
  userId: string;
  userFullName: string;
}

/**
 * Creates in-app notification rows for all ADMIN members of a network
 * when a new verification request is submitted.
 * Publishes to Redis so online admins receive real-time alerts.
 */
export const notifyAdminNewVerification = task({
  id: "notify-admin-new-verification",
  retry: retryConfig,
  run: async (payload: NotifyAdminNewVerificationPayload) => {
    logger.info(
      { reqId: payload.reqId, networkId: payload.networkId },
      "[Task:notifyAdminNewVerification] starting",
    );

    // Find all verified admins in this network.
    const admins = await db.networkMember.findMany({
      where: {
        networkId: payload.networkId,
        role: "ADMIN",
        status: "VERIFIED",
      },
      select: { userId: true },
    });

    if (admins.length === 0) {
      logger.warn(
        { networkId: payload.networkId },
        "[Task:notifyAdminNewVerification] no admins found in network",
      );
      return;
    }

    const message = `New verification request from ${payload.userFullName}`;
    const link = `/admin/verification/${payload.reqId}`;

    // Batch-create in-app notification rows.
    await db.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.userId,
        networkId: payload.networkId,
        type: "ACCOUNT_VERIFIED" as const, // closest available type for admin alert
        relatedId: payload.reqId,
        message,
        link,
      })),
      skipDuplicates: true,
    });

    // Publish real-time alert to each admin if they're online (Socket.IO picks this up).
    for (const admin of admins) {
      await redisPublish(`user:${admin.userId}:notif`, {
        type: "ACCOUNT_VERIFIED",
        message,
        link,
        relatedId: payload.reqId,
      });
    }

    logger.info(
      { reqId: payload.reqId, adminCount: admins.length },
      "[Task:notifyAdminNewVerification] done",
    );
  },
});

// ── Task: notifyUserVerificationOutcome ──────────────────────────────────────

export interface NotifyUserVerificationOutcomePayload {
  userId: string;
  networkId: string;
  reqId: string;
  approved: boolean;
  userEmail: string;
  userFullName: string;
  networkName: string;
  reason?: string;
}

/**
 * Notifies the user of their verification outcome:
 * 1. Creates an in-app notification row
 * 2. Publishes to Redis (Socket.IO real-time delivery if online)
 * 3. Triggers the outcome email task
 */
export const notifyUserVerificationOutcome = task({
  id: "notify-user-verification-outcome",
  retry: retryConfig,
  run: async (payload: NotifyUserVerificationOutcomePayload) => {
    logger.info(
      { userId: payload.userId, approved: payload.approved },
      "[Task:notifyUserVerificationOutcome] starting",
    );

    const message = payload.approved
      ? `Your account in ${payload.networkName} has been verified!`
      : `Your verification for ${payload.networkName} was not approved.`;

    const type = payload.approved
      ? ("ACCOUNT_VERIFIED" as const)
      : ("ACCOUNT_REJECTED" as const);

    // 1. In-app notification row.
    await db.notification.create({
      data: {
        userId: payload.userId,
        networkId: payload.networkId,
        type,
        relatedId: payload.reqId,
        message,
        link: "/verification/status",
      },
    });

    // 2. Real-time push via Redis → Socket.IO.
    await redisPublish(`user:${payload.userId}:notif`, {
      type,
      message,
      link: "/verification/status",
    });

    // 3. Send outcome email (separate task for independent retry).
    await sendVerificationOutcomeEmail.trigger({
      userId: payload.userId,
      email: payload.userEmail,
      fullName: payload.userFullName,
      approved: payload.approved,
      ...(payload.reason !== undefined ? { reason: payload.reason } : {}),
    });

    logger.info(
      { userId: payload.userId },
      "[Task:notifyUserVerificationOutcome] done",
    );
  },
});

export interface NotifyNetworkNewJobPayload {
  jobId: string;
  networkId: string;
  title: string;
  networkName: string;
}

export const notifyNetworkNewJob = task({
  id: "notify-network-new-job",
  retry: retryConfig,
  run: async (payload: NotifyNetworkNewJobPayload) => {
    logger.info(
      { jobId: payload.jobId, networkId: payload.networkId },
      "[Task:notifyNetworkNewJob] starting",
    );

    // Find all verified members in this network
    const members = await db.networkMember.findMany({
      where: {
        networkId: payload.networkId,
        status: "VERIFIED",
      },
      select: { userId: true },
    });

    if (members.length === 0) {
      return;
    }

    const message = `New job opening in ${payload.networkName}: ${payload.title}`;
    const link = `/jobs`;

    // Batch create notifications
    await db.notification.createMany({
      data: members.map((member) => ({
        userId: member.userId,
        networkId: payload.networkId,
        type: "ANNOUNCEMENT" as const,
        relatedId: payload.jobId,
        message,
        link,
      })),
      skipDuplicates: true,
    });

    // Publish notifications to Redis for online members
    for (const member of members) {
      await redisPublish(`user:${member.userId}:notif`, {
        type: "ANNOUNCEMENT",
        message,
        link,
        relatedId: payload.jobId,
      });
    }

    logger.info(
      { jobId: payload.jobId, count: members.length },
      "[Task:notifyNetworkNewJob] done",
    );
  },
});

