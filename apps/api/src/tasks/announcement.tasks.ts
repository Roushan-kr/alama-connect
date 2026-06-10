/**
 * src/tasks/announcement.tasks.ts
 */

import { task } from "@trigger.dev/sdk/v3";
import { db } from "../config/db.js";
import { logger } from "../config/logger.js";
import { redisPublish } from "../config/redis.js";
import { sendEmail } from "../services/email/index.js";

const retryConfig = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 1000,
  maxTimeoutInMs: 30_000,
  randomize: true,
};

export interface NotifyNetworkAnnouncementPayload {
  contentId: string;
  networkId: string;
  title: string;
  message: string;
}

export const notifyNetworkAnnouncement = task({
  id: "notify-network-announcement",
  retry: retryConfig,
  run: async (payload: NotifyNetworkAnnouncementPayload) => {
    const { contentId, networkId, title, message } = payload;
    logger.info({ contentId, networkId }, "[Task:notifyNetworkAnnouncement] starting");

    let cursor: string | undefined = undefined;
    let totalNotified = 0;

    while (true) {
      const batch: { userId: string }[] = await db.networkMember.findMany({
        where: {
          networkId,
          status: "VERIFIED",
          ...(cursor ? { userId: { gt: cursor } } : {}),
        },
        orderBy: { userId: "asc" },
        take: 100,
        select: { userId: true },
      });

      if (batch.length === 0) break;

      // 1. Create notification rows for this batch
      await db.notification.createMany({
        data: batch.map((member: { userId: string }) => ({
          userId: member.userId,
          networkId,
          type: "ANNOUNCEMENT",
          relatedId: contentId,
          message: `${title}: ${message}`,
          link: `/announcements`,
        })),
        skipDuplicates: true,
      });

      // 2. Publish to Redis for live Socket.IO delivery
      for (const member of batch) {
        await redisPublish(`user:${member.userId}:notif`, {
          type: "ANNOUNCEMENT",
          message: `${title}: ${message}`,
          link: `/announcements`,
          relatedId: contentId,
        });
      }

      totalNotified += batch.length;
      const lastItem = batch[batch.length - 1];
      cursor = lastItem ? lastItem.userId : undefined;
    }

    logger.info({ contentId, totalNotified }, "[Task:notifyNetworkAnnouncement] finished");
  },
});

export interface SendNewsletterEmailsPayload {
  contentId: string;
  networkId: string;
  title: string;
  body: string;
}

export const sendNewsletterEmails = task({
  id: "send-newsletter-emails",
  retry: retryConfig,
  run: async (payload: SendNewsletterEmailsPayload) => {
    const { contentId, networkId, title, body } = payload;
    logger.info({ contentId, networkId }, "[Task:sendNewsletterEmails] starting");

    let cursor: string | undefined = undefined;
    let totalEmailsSent = 0;

    type MemberWithEmail = {
      userId: string;
      user: {
        email: string;
        profile: {
          fullName: string | null;
        } | null;
      };
    };

    while (true) {
      const batch: MemberWithEmail[] = await db.networkMember.findMany({
        where: {
          networkId,
          status: "VERIFIED",
          ...(cursor ? { userId: { gt: cursor } } : {}),
        },
        orderBy: { userId: "asc" },
        take: 100,
        select: {
          userId: true,
          user: {
            select: {
              email: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      }) as unknown as MemberWithEmail[];

      if (batch.length === 0) break;

      // Send email to each user with rate limit control (10 emails/second)
      for (const member of batch) {
        const email = member.user.email;
        const name = member.user.profile?.fullName || "Valued Member";

        try {
          await sendEmail({
            to: email,
            subject: title,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                <h2>Hello ${name},</h2>
                <p>A new announcement/newsletter has been posted to your alumni network:</p>
                <div style="border-left: 4px solid #4F46E5; padding-left: 15px; margin: 20px 0; background-color: #F9FAFB; padding-top: 10px; padding-bottom: 10px;">
                  <h3 style="margin-top: 0; color: #4F46E5;">${title}</h3>
                  <p style="white-space: pre-wrap;">${body}</p>
                </div>
                <p>Best regards,</p>
                <p>Your Campus Alumni Connect Team</p>
              </div>
            `,
          });

          totalEmailsSent++;
        } catch (err) {
          logger.error({ err, userId: member.userId, email }, "[Task:sendNewsletterEmails] Failed to send email to user");
        }

        // 100ms sleep results in exactly 10 requests per second maximum
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const lastItem = batch[batch.length - 1];
      cursor = lastItem ? lastItem.userId : undefined;
    }

    logger.info({ contentId, totalEmailsSent }, "[Task:sendNewsletterEmails] finished");
  },
});
