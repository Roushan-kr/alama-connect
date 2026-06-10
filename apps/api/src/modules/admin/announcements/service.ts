/**
 * src/modules/admin/announcements/service.ts
 */

import { db } from "@/config/db.js";
import { ContentType, ContentVisibility } from "@prisma/client";
import type { CreateAnnouncementInput, CreateNewsletterInput } from "./schemas.js";
import {
  notifyNetworkAnnouncement,
  sendNewsletterEmails,
} from "@/tasks/announcement.tasks.js";

/**
 * Verify if the user is a verified admin in the given network.
 */
async function verifyAdmin(userId: string, networkId: string) {
  const membership = await db.networkMember.findUnique({
    where: {
      userId_networkId: { userId, networkId },
    },
    select: { role: true, status: true },
  });

  if (
    !membership ||
    membership.status !== "VERIFIED" ||
    membership.role !== "ADMIN"
  ) {
    throw new Error("Unauthorized: Only verified network admins can perform this action");
  }
}

/**
 * Create a new announcement and trigger dispatch task.
 */
export async function createAnnouncement(
  adminUserId: string,
  data: CreateAnnouncementInput
) {
  await verifyAdmin(adminUserId, data.networkId);

  const announcement = await db.content.create({
    data: {
      networkId: data.networkId,
      contentType: ContentType.ANNOUNCEMENT,
      title: data.title,
      body: data.body,
      createdBy: adminUserId,
      visibility: ContentVisibility.NETWORK,
    },
  });

  // Trigger Trigger.dev task to notify all members
  await notifyNetworkAnnouncement.trigger({
    contentId: announcement.contentId,
    networkId: data.networkId,
    title: data.title,
    message: data.body.substring(0, 100) + (data.body.length > 100 ? "..." : ""),
  });

  return announcement;
}

/**
 * Create a new newsletter and trigger email dispatch task.
 */
export async function createNewsletter(
  adminUserId: string,
  data: CreateNewsletterInput
) {
  await verifyAdmin(adminUserId, data.networkId);

  const newsletter = await db.content.create({
    data: {
      networkId: data.networkId,
      contentType: ContentType.NEWSLETTER,
      title: data.title,
      body: data.body,
      createdBy: adminUserId,
      visibility: ContentVisibility.NETWORK,
    },
  });

  // Trigger Trigger.dev task to send email newsletters
  await sendNewsletterEmails.trigger({
    contentId: newsletter.contentId,
    networkId: data.networkId,
    title: data.title,
    body: data.body,
  });

  return newsletter;
}
