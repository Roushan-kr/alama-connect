/**
 * src/modules/posts/service.ts — likes and comments on content rows.
 */

import type { AuthorSummary, PaginationMeta } from "@alumni/shared"
import { db } from "../../config/db.js"
import { logger } from "../../config/logger.js"
import { createInAppNotification } from "../../tasks/notification.tasks.js"
import type { CommentsQuery, CreateCommentInput } from "./schemas.js"

type ServiceError = Error & { code?: string; status?: number }

export interface CommentItem {
  commentId: string
  contentId: string
  body: string
  parentId: string | null
  createdAt: string
  author: AuthorSummary
}

export interface CommentsPage {
  data: CommentItem[]
  meta: PaginationMeta
}

function toAuthor(author: {
  userId: string
  username: string
  profile: {
    fullName: string | null
    headline: string | null
    profileImage: string | null
  } | null
}): AuthorSummary {
  return {
    userId: author.userId,
    username: author.username,
    fullName: author.profile?.fullName ?? null,
    headline: author.profile?.headline ?? null,
    profileImage: author.profile?.profileImage ?? null,
  }
}

async function getContentForInteraction(
  contentId: string,
): Promise<{ contentId: string; createdBy: string; networkId: string }> {
  const content = await db.content.findUnique({
    where: { contentId },
    select: { contentId: true, createdBy: true, networkId: true },
  })

  if (!content) {
    throw Object.assign(new Error("Post not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  return content
}

export async function likePost(
  userId: string,
  contentId: string,
): Promise<void> {
  const content = await getContentForInteraction(contentId)

  await db.postLike.upsert({
    where: { userId_contentId: { userId, contentId } },
    create: { userId, contentId },
    update: {},
  })

  if (content.createdBy !== userId) {
    await createInAppNotification.trigger({
      userId: content.createdBy,
      networkId: content.networkId,
      type: "POST_LIKED",
      relatedId: contentId,
      message: "Someone liked your post",
      link: `/posts/${contentId}`,
    })
  }

  logger.debug({ userId, contentId }, "[Posts] liked")
}

export async function unlikePost(
  userId: string,
  contentId: string,
): Promise<void> {
  await getContentForInteraction(contentId)

  await db.postLike.deleteMany({
    where: { userId, contentId },
  })
}

export async function createComment(
  userId: string,
  contentId: string,
  input: CreateCommentInput,
): Promise<{ commentId: string }> {
  const content = await getContentForInteraction(contentId)

  if (input.parentId) {
    const parent = await db.postComment.findFirst({
      where: { commentId: input.parentId, contentId },
    })
    if (!parent) {
      throw Object.assign(new Error("Parent comment not found"), {
        code: "NOT_FOUND",
        status: 404,
      })
    }
  }

  const comment = await db.postComment.create({
    data: {
      contentId,
      userId,
      body: input.body,
      parentId: input.parentId ?? null,
    },
    select: { commentId: true },
  })

  if (content.createdBy !== userId) {
    await createInAppNotification.trigger({
      userId: content.createdBy,
      networkId: content.networkId,
      type: "POST_COMMENTED",
      relatedId: contentId,
      message: "Someone commented on your post",
      link: `/posts/${contentId}`,
    })
  }

  return { commentId: comment.commentId }
}

export async function getComments(
  contentId: string,
  query: CommentsQuery,
): Promise<CommentsPage> {
  await getContentForInteraction(contentId)

  let cursorRow: { createdAt: Date; commentId: string } | null = null
  if (query.cursor) {
    const row = await db.postComment.findFirst({
      where: { commentId: query.cursor, contentId },
      select: { createdAt: true, commentId: true },
    })
    if (!row) {
      throw Object.assign(new Error("Invalid comment cursor"), {
        code: "VALIDATION_ERROR",
        status: 400,
      })
    }
    cursorRow = row
  }

  const rows = await db.postComment.findMany({
    where: {
      contentId,
      parentId: null,
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              {
                createdAt: cursorRow.createdAt,
                commentId: { lt: cursorRow.commentId },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { commentId: "desc" }],
    take: query.limit + 1,
    include: {
      user: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
    },
  })

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const last = page[page.length - 1]

  return {
    data: page.map((row) => ({
      commentId: row.commentId,
      contentId: row.contentId,
      body: row.body,
      parentId: row.parentId,
      createdAt: row.createdAt.toISOString(),
      author: toAuthor(row.user),
    })),
    meta: {
      nextCursor: hasMore && last ? last.commentId : null,
      hasMore,
      limit: query.limit,
    },
  }
}

export async function deleteComment(
  userId: string,
  commentId: string,
): Promise<void> {
  const comment = await db.postComment.findUnique({
    where: { commentId },
    select: { userId: true },
  })

  if (!comment) {
    throw Object.assign(new Error("Comment not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  if (comment.userId !== userId) {
    throw Object.assign(new Error("You can only delete your own comments"), {
      code: "FORBIDDEN",
      status: 403,
    })
  }

  await db.postComment.delete({ where: { commentId } })
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof Error && "code" in err
}
