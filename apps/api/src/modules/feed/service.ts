/**
 * src/modules/feed/service.ts
 *
 * Feed and post creation business logic.
 * Cache key: feed:network:{networkId}:{cursorHash}, TTL 60s ± jitter.
 */

import { createHash } from "node:crypto"
import type { AuthorSummary, ContentVisibility, PaginationMeta } from "@alumni/shared"
import { db } from "../../config/db.js"
import { redis } from "../../config/redis.js"
import { logger } from "../../config/logger.js"
import { jitteredTtl } from "../../lib/cache.js"
import { parseHashtags } from "../../lib/content-parse.js"
import { scanBuffer } from "../../services/storage/virusScan.js"
import { uploadFile, buildKey, getSignedUrl } from "../../services/storage/index.js"

import type { CreatePostInput, FeedQuery } from "./schemas.js"
import { invalidateFeedCache, processMentions } from "../../tasks/feed.tasks.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedMediaItem {
  mediaId: string
  url: string | null
  mediaType: string
  displayOrder: number
}

export interface FeedItem {
  contentId: string
  contentType: string
  networkId: string
  groupId: string | null
  title: string | null
  body: string | null
  tags: string[]
  meta: Record<string, unknown>
  visibility: keyof typeof ContentVisibility
  isPinned: boolean
  createdAt: string
  author: AuthorSummary
  likesCount: number
  commentsCount: number
  userLiked: boolean
  media: FeedMediaItem[]
}

export interface FeedPage {
  data: FeedItem[]
  meta: PaginationMeta
}

type ServiceError = Error & { code?: string; status?: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function feedCacheKey(networkId: string, cursorHash: string, groupId?: string): string {
  return groupId ? `feed:group:${groupId}:${cursorHash}` : `feed:network:${networkId}:${cursorHash}`
}

function cursorHash(cursor: string | undefined): string {
  if (!cursor) return "start"
  return createHash("sha256").update(cursor).digest("hex").slice(0, 16)
}

async function requireVerifiedMember(
  userId: string,
  networkId: string,
): Promise<void> {
  const member = await db.networkMember.findUnique({
    where: { userId_networkId: { userId, networkId } },
    select: { status: true },
  })

  if (!member || member.status !== "VERIFIED") {
    throw Object.assign(
      new Error("You must be a verified member of this network to access the feed"),
      { code: "FORBIDDEN", status: 403 },
    )
  }
}

async function resolveNetworkId(
  userId: string,
  networkId: string | undefined,
): Promise<string> {
  if (networkId) {
    await requireVerifiedMember(userId, networkId)
    return networkId
  }

  const membership = await db.networkMember.findFirst({
    where: { userId, status: "VERIFIED" },
    select: { networkId: true },
    orderBy: { joinedAt: "asc" },
  })

  if (!membership) {
    throw Object.assign(
      new Error("No verified network membership found"),
      { code: "FORBIDDEN", status: 403 },
    )
  }

  return membership.networkId
}

function buildKeysetWhere(
  networkId: string,
  cursorContentId: string | undefined,
  authorId?: string,
): Promise<{ createdAt: Date; contentId: string } | null> {
  if (!cursorContentId) return Promise.resolve(null)

  return db.content
    .findFirst({
      where: {
        contentId: cursorContentId,
        networkId,
        ...(authorId !== undefined ? { createdBy: authorId } : {}),
      },
      select: { createdAt: true, contentId: true },
    })
    .then((row) => {
      if (!row) {
        throw Object.assign(new Error("Invalid feed cursor"), {
          code: "VALIDATION_ERROR",
          status: 400,
        })
      }
      return row
    })
}

function toAuthorSummary(author: {
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

// ── Create Post ───────────────────────────────────────────────────────────────

export interface CreatePostOptions {
  userId: string
  input: CreatePostInput
  imageFiles?: Array<{ buffer: Buffer; filename: string; mimeType: string }>
}

export async function createPost(
  opts: CreatePostOptions,
): Promise<{ contentId: string }> {
  const { userId, input, imageFiles = [] } = opts

  await requireVerifiedMember(userId, input.networkId)

  const tags = parseHashtags(input.body)

  const content = await db.content.create({
    data: {
      networkId: input.networkId,
      groupId: input.groupId ?? null,
      contentType: "SOCIAL_POST",
      title: input.title ?? null,
      body: input.body,
      tags,
      meta: {},
      createdBy: userId,
      visibility: input.visibility,
    },
    select: { contentId: true, body: true },
  })

  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i]
    if (!file) continue

    const scan = await scanBuffer(file.buffer, file.filename)
    if (!scan.clean) {
      throw Object.assign(
        new Error(`File rejected: malware detected (${scan.threat ?? "unknown"})`),
        { code: "FILE_INFECTED", status: 422 },
      )
    }

    const key = buildKey("posts", userId, content.contentId, file.filename)
    const storedKey = await uploadFile(file.buffer, key, file.mimeType)

    await db.postMedia.create({
      data: {
        contentId: content.contentId,
        url: storedKey,
        mediaType: file.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE",
        displayOrder: i,
      },
    })
  }

  await invalidateFeedCache.trigger({ networkId: input.networkId })
  await processMentions.trigger({
    contentId: content.contentId,
    bodyText: content.body ?? "",
    authorId: userId,
    networkId: input.networkId,
  })

  logger.info({ contentId: content.contentId, userId }, "[Feed] post created")

  return { contentId: content.contentId }
}

// ── Feed Queries ──────────────────────────────────────────────────────────────

async function fetchFeedFromDb(
  networkId: string,
  viewerId: string,
  limit: number,
  cursorContentId: string | undefined,
  authorId?: string,
  groupId?: string,
): Promise<FeedPage> {
  const cursorRow = await buildKeysetWhere(networkId, cursorContentId, authorId)

  const rows = await db.content.findMany({
    where: {
      networkId,
      groupId: groupId ?? null,
      ...(authorId !== undefined ? { createdBy: authorId } : {}),
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              {
                createdAt: cursorRow.createdAt,
                contentId: { lt: cursorRow.contentId },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { contentId: "desc" }],
    take: limit + 1,
    include: {
      author: {
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
      media: { orderBy: { displayOrder: "asc" } },
      _count: { select: { likes: true, comments: true } },
      likes: {
        where: { userId: viewerId },
        select: { userId: true },
        take: 1,
      },
    },
  })

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const data: FeedItem[] = await Promise.all(
    page.map(async (row) => {
      const media: FeedMediaItem[] = await Promise.all(
        row.media.map(async (m) => {
          let url: string | null = null
          try {
            url = await getSignedUrl(m.url)
          } catch {
            url = null
          }
          return {
            mediaId: m.mediaId,
            url,
            mediaType: m.mediaType,
            displayOrder: m.displayOrder,
          }
        }),
      )

      return {
        contentId: row.contentId,
        contentType: row.contentType,
        networkId: row.networkId,
        groupId: row.groupId,
        title: row.title,
        body: row.body,
        tags: row.tags,
        meta: row.meta as Record<string, unknown>,
        visibility: row.visibility,
        isPinned: row.isPinned,
        createdAt: row.createdAt.toISOString(),
        author: toAuthorSummary(row.author),
        likesCount: row._count.likes,
        commentsCount: row._count.comments,
        userLiked: row.likes.length > 0,
        media,
      }
    }),
  )

  const last = page[page.length - 1]
  const meta: PaginationMeta = {
    nextCursor: hasMore && last ? last.contentId : null,
    hasMore,
    limit,
  }

  return { data, meta }
}

async function getCachedFeed(
  networkId: string,
  viewerId: string,
  query: FeedQuery,
  authorId?: string,
): Promise<FeedPage> {
  const hash = cursorHash(query.cursor)
  const cacheKey = feedCacheKey(networkId, hash, query.groupId)

  const cached = await redis.get(cacheKey)
  if (cached) {
    const page = JSON.parse(cached) as FeedPage
    if (!authorId) return page
  }

  const page = await fetchFeedFromDb(
    networkId,
    viewerId,
    query.limit,
    query.cursor,
    authorId,
    query.groupId,
  )

  if (!authorId) {
    await redis.setex(cacheKey, jitteredTtl(60), JSON.stringify(page))
  }

  return page
}

export async function getGlobalFeed(
  userId: string,
  query: FeedQuery,
): Promise<FeedPage> {
  const networkId = await resolveNetworkId(userId, query.networkId)
  return getCachedFeed(networkId, userId, query)
}

export async function getUserFeed(
  viewerId: string,
  targetUserId: string,
  query: FeedQuery,
): Promise<FeedPage> {
  const networkId = await resolveNetworkId(viewerId, query.networkId)

  const targetVerified = await db.networkMember.findFirst({
    where: { userId: targetUserId, networkId, status: "VERIFIED" },
  })

  if (!targetVerified) {
    throw Object.assign(new Error("User feed is not available"), {
      code: "PROFILE_NOT_AVAILABLE",
      status: 403,
    })
  }

  return getCachedFeed(networkId, viewerId, query, targetUserId)
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof Error && "code" in err
}
