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
  groupId?: string;
}

export const notifyNetworkAnnouncement = task({
  id: "notify-network-announcement",
  retry: retryConfig,
  run: async (payload: NotifyNetworkAnnouncementPayload) => {
    const { contentId, networkId, title, message, groupId } = payload;
    logger.info({ contentId, networkId, groupId }, "[Task:notifyNetworkAnnouncement] starting");

    let cursor: string | undefined = undefined;
    let totalNotified = 0;

    while (true) {
      let batch: { userId: string }[] = [];

      if (groupId) {
        // Enforce verified network member check by joining group_members and network_members
        batch = await db.groupMember.findMany({
          where: {
            groupId,
            user: {
              networkMemberships: {
                some: {
                  networkId,
                  status: "VERIFIED",
                },
              },
            },
            ...(cursor ? { userId: { gt: cursor } } : {}),
          },
          orderBy: { userId: "asc" },
          take: 100,
          select: { userId: true },
        });
      } else {
        batch = await db.networkMember.findMany({
          where: {
            networkId,
            status: "VERIFIED",
            ...(cursor ? { userId: { gt: cursor } } : {}),
          },
          orderBy: { userId: "asc" },
          take: 100,
          select: { userId: true },
        });
      }

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
  groupId?: string;
}

type MemberWithEmail = {
  userId: string;
  user: {
    email: string;
    profile: {
      fullName: string | null;
    } | null;
  };
};

export const sendNewsletterEmails = task({
  id: "send-newsletter-emails",
  retry: retryConfig,
  run: async (payload: SendNewsletterEmailsPayload) => {
    const { contentId, networkId, title, body, groupId } = payload;
    logger.info({ contentId, networkId, groupId }, "[Task:sendNewsletterEmails] starting");

    let cursor: string | undefined = undefined;
    let totalEmailsSent = 0;

    while (true) {
      let batch: MemberWithEmail[] = [];

      if (groupId) {
        batch = await db.groupMember.findMany({
          where: {
            groupId,
            user: {
              networkMemberships: {
                some: {
                  networkId,
                  status: "VERIFIED",
                },
              },
            },
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
      } else {
        batch = await db.networkMember.findMany({
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
      }

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

export interface SuperAdminBroadcastPayload {
  networkIds: string[];
  groupIds: string[];
  type: "ANNOUNCEMENT" | "NEWSLETTER";
  title: string;
  body: string;
  senderUserId: string;
}

export const superAdminBroadcast = task({
  id: "super-admin-broadcast",
  retry: retryConfig,
  run: async (payload: SuperAdminBroadcastPayload) => {
    const { networkIds, groupIds, type, title, body, senderUserId } = payload;
    logger.info({ networkIds, groupIds, type }, "[Task:superAdminBroadcast] starting");

    // 1. Validate group-network relationships
    if (groupIds.length > 0 && networkIds.length > 0) {
      const groups = await db.group.findMany({
        where: { groupId: { in: groupIds } },
        select: { networkId: true },
      });
      for (const g of groups) {
        if (!networkIds.includes(g.networkId)) {
          throw new Error(`Invalid group selection: Group does not belong to the selected networks`);
        }
      }
    }

    // 2. Resolve and deduplicate recipient list
    const userIds = new Set<string>();

    if (networkIds.length > 0) {
      const netMembers = await db.networkMember.findMany({
        where: { networkId: { in: networkIds }, status: "VERIFIED" },
        select: { userId: true },
      });
      for (const m of netMembers) userIds.add(m.userId);
    }

    if (groupIds.length > 0) {
      const grpMembers = await db.groupMember.findMany({
        where: {
          groupId: { in: groupIds },
          user: {
            networkMemberships: {
              some: {
                status: "VERIFIED",
              },
            },
          },
        },
        select: { userId: true },
      });
      for (const m of grpMembers) userIds.add(m.userId);
    }

    const recipientList = Array.from(userIds);

    // 3. Create single Content row per targeted network or group (Audit Log in Content.meta)
    const metaAudit = {
      isSuperAdminBroadcast: true,
      targetNetworks: networkIds,
      targetGroups: groupIds,
      recipientCount: recipientList.length,
      senderUserId,
      createdAt: new Date().toISOString(),
    };

    const createdContentIds: string[] = [];

    for (const netId of networkIds) {
      const row = await db.content.create({
        data: {
          networkId: netId,
          contentType: type === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : "NEWSLETTER",
          title,
          body,
          createdBy: senderUserId,
          visibility: "NETWORK",
          meta: metaAudit,
        },
      });
      createdContentIds.push(row.contentId);
    }

    for (const grpId of groupIds) {
      const grp = await db.group.findUnique({
        where: { groupId: grpId },
        select: { networkId: true },
      });
      if (grp) {
        const row = await db.content.create({
          data: {
            networkId: grp.networkId,
            groupId: grpId,
            contentType: type === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : "NEWSLETTER",
            title,
            body,
            createdBy: senderUserId,
            visibility: "GROUP",
            meta: metaAudit,
          },
        });
        createdContentIds.push(row.contentId);
      }
    }

    // 4. Send notifications or emails to deduplicated recipients in batches of 100
    let index = 0;
    while (index < recipientList.length) {
      const batchIds = recipientList.slice(index, index + 100);
      index += 100;

      if (type === "ANNOUNCEMENT") {
        // Create DB notifications for this batch
        await db.notification.createMany({
          data: batchIds.map((userId) => ({
            userId,
            type: "ANNOUNCEMENT",
            message: `${title}: ${body.substring(0, 100)}${body.length > 100 ? "..." : ""}`,
            link: `/announcements`,
            relatedId: createdContentIds[0] ?? null,
          })),
          skipDuplicates: true,
        });

        // Publish Socket.IO heartbeats to Redis
        for (const userId of batchIds) {
          await redisPublish(`user:${userId}:notif`, {
            type: "ANNOUNCEMENT",
            message: `${title}: ${body.substring(0, 100)}${body.length > 100 ? "..." : ""}`,
            link: `/announcements`,
            relatedId: createdContentIds[0] ?? null,
          });
        }
      } else {
        // Newsletters email broadcast
        const users = await db.user.findMany({
          where: { userId: { in: batchIds } },
          select: {
            userId: true,
            email: true,
            profile: { select: { fullName: true } },
            username: true,
          },
        });

        for (const user of users) {
          const name = user.profile?.fullName || user.username;
          try {
            await sendEmail({
              to: user.email,
              subject: title,
              html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">
                  <h2>Hello ${name},</h2>
                  <p>A new newsletter update has been broadcast by the platform administration:</p>
                  <div style="border-left: 4px solid #4F46E5; padding-left: 15px; margin: 20px 0; background-color: #F9FAFB; padding-top: 10px; padding-bottom: 10px;">
                    <h3 style="margin-top: 0; color: #4F46E5;">${title}</h3>
                    <p style="white-space: pre-wrap;">${body}</p>
                  </div>
                  <p>Best regards,</p>
                  <p>Your Alumni Platform Team</p>
                </div>
              `,
            });
          } catch (err) {
            logger.error({ err, userId: user.userId, email: user.email }, "[Task:superAdminBroadcast] Failed to send email");
          }
          await new Promise((resolve) => setTimeout(resolve, 100)); // 10 emails/second
        }
      }
    }

    logger.info(
      {
        action: "SUPER_ADMIN_BROADCAST",
        createdBy: senderUserId,
        targetNetworksCount: networkIds.length,
        targetGroupsCount: groupIds.length,
        type,
        recipientCount: recipientList.length,
      },
      "[Broadcast] Super admin broadcast finished auditing"
    );
  },
});
