/**
 * src/modules/jobs/service.ts
 */

import { db } from "../../config/db.js";
import { notifyNetworkNewJob } from "../../tasks/notification.tasks.js";
import { type CreateJobInput } from "./schemas.js";
import { ContentVisibility, ContentType } from "@prisma/client";

export async function createJob(
  userId: string,
  networkId: string,
  data: CreateJobInput
) {
  const expiresAtDate = data.expiresAt ? new Date(data.expiresAt) : null;

  return await db.$transaction(async (tx) => {
    // 1. Create content row
    const content = await tx.content.create({
      data: {
        networkId,
        contentType: ContentType.JOB,
        title: data.title,
        body: data.description,
        tags: data.tags,
        visibility: data.visibility,
        createdBy: userId,
        meta: {
          apply_link: data.applyLink || null,
          location: data.location,
          expires_at: expiresAtDate ? expiresAtDate.toISOString() : null,
        },
      },
    });

    // 2. Create job companion row
    const job = await tx.job.create({
      data: {
        contentId: content.contentId,
        postedBy: userId,
        networkId,
        title: data.title,
        description: data.description,
        location: data.location,
        applyLink: data.applyLink || null,
        tags: data.tags,
        expiresAt: expiresAtDate,
      },
    });

    // Fetch network name for notification
    const network = await tx.network.findUnique({
      where: { networkId },
      select: { name: true },
    });

    // 3. Fire-and-forget notification task
    await notifyNetworkNewJob.trigger({
      jobId: job.jobId,
      networkId,
      title: data.title,
      networkName: network?.name || "our university network",
    });

    return { content, job };
  });
}

export async function listJobs(
  networkId: string,
  filters: { tags?: string[] },
  cursor?: string,
  cursorId?: string,
  limit = 20
) {
  const where: any = {
    networkId,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } },
    ],
  };

  if (filters.tags && filters.tags.length > 0) {
    where.tags = {
      hasEvery: filters.tags,
    };
  }

  if (cursor && cursorId) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: new Date(cursor) } },
          {
            createdAt: new Date(cursor),
            jobId: { lt: cursorId },
          },
        ],
      },
    ];
  }

  const jobs = await db.job.findMany({
    where,
    take: limit + 1,
    orderBy: [
      { createdAt: "desc" },
      { jobId: "desc" },
    ],
    include: {
      poster: {
        select: {
          userId: true,
          email: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
      content: true,
    },
  });

  const hasMore = jobs.length > limit;
  const data = hasMore ? jobs.slice(0, limit) : jobs;

  let nextCursor: string | null = null;
  let nextCursorId: string | null = null;

  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1];
    if (lastItem) {
      nextCursor = lastItem.createdAt.toISOString();
      nextCursorId = lastItem.jobId;
    }
  }

  return {
    data,
    meta: {
      nextCursor,
      nextCursorId,
      hasMore,
      limit,
    },
  };
}

export async function getJob(contentId: string) {
  const content = await db.content.findUnique({
    where: { contentId },
    include: {
      job: true,
      author: {
        select: {
          userId: true,
          email: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
    },
  });

  if (!content || content.contentType !== ContentType.JOB) {
    throw new Error("Job not found");
  }

  return content;
}

export async function deleteJob(userId: string, contentId: string) {
  const content = await db.content.findUnique({
    where: { contentId },
    select: { createdBy: true, networkId: true },
  });

  if (!content) {
    throw new Error("Job not found");
  }

  // Check if owner or admin
  const isOwner = content.createdBy === userId;
  const membership = await db.networkMember.findUnique({
    where: {
      userId_networkId: {
        userId,
        networkId: content.networkId,
      },
    },
    select: { role: true },
  });

  const isAdmin = membership?.role === "ADMIN";

  if (!isOwner && !isAdmin) {
    throw new Error("Unauthorized to delete this job");
  }

  // Soft delete by updating visibility to GROUP
  return await db.content.update({
    where: { contentId },
    data: { visibility: ContentVisibility.GROUP },
  });
}
