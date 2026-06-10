/**
 * src/tasks/feed.tasks.ts
 *
 * Trigger.dev feed tasks:
 *   - invalidateFeedCache — delete feed:network:{networkId}:* keys
 *   - processMentions — @username → in-app notifications
 *   - processHashtags — trending cache stub (tags already stored on content row)
 */

import { task } from "@trigger.dev/sdk/v3"
import { db } from "../config/db.js"
import { redis } from "../config/redis.js"
import { logger } from "../config/logger.js"
import { parseMentionUsernames } from "../lib/content-parse.js"
import { createInAppNotification } from "./notification.tasks.js"

const retryConfig = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutInMs: 1000,
  maxTimeoutInMs: 30_000,
  randomize: true,
}

// ── invalidateFeedCache ─────────────────────────────────────────────────────

export interface InvalidateFeedCachePayload {
  networkId: string
}

export const invalidateFeedCache = task({
  id: "invalidate-feed-cache",
  retry: retryConfig,
  run: async (payload: InvalidateFeedCachePayload) => {
    const pattern = `feed:network:${payload.networkId}:*`
    let cursor = "0"
    let deleted = 0

    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100)
      cursor = next
      if (keys.length > 0) {
        await redis.del(...keys)
        deleted += keys.length
      }
    } while (cursor !== "0")

    logger.info(
      { networkId: payload.networkId, deleted },
      "[Task:invalidateFeedCache] done",
    )
  },
})

// ── processMentions ───────────────────────────────────────────────────────────

export interface ProcessMentionsPayload {
  contentId: string
  bodyText: string
  authorId: string
  networkId: string
}

export const processMentions = task({
  id: "process-mentions",
  retry: retryConfig,
  run: async (payload: ProcessMentionsPayload) => {
    const usernames = parseMentionUsernames(payload.bodyText)
    if (usernames.length === 0) return

    const users = await db.user.findMany({
      where: { username: { in: usernames, mode: "insensitive" } },
      select: { userId: true, username: true },
    })

    for (const user of users) {
      if (user.userId === payload.authorId) continue

      await createInAppNotification.trigger({
        userId: user.userId,
        networkId: payload.networkId,
        type: "POST_MENTIONED",
        relatedId: payload.contentId,
        message: "You were mentioned in a post",
        link: `/posts/${payload.contentId}`,
      })
    }

    logger.info(
      { contentId: payload.contentId, mentionCount: users.length },
      "[Task:processMentions] done",
    )
  },
})

// ── processHashtags ─────────────────────────────────────────────────────────────

export interface ProcessHashtagsPayload {
  contentId: string
  tags: string[]
  networkId: string
}

/** Reserved for trending cache; tags are persisted on the content row at write time. */
export const processHashtags = task({
  id: "process-hashtags",
  retry: retryConfig,
  run: async (payload: ProcessHashtagsPayload) => {
    if (payload.tags.length === 0) return

    logger.debug(
      { contentId: payload.contentId, tags: payload.tags },
      "[Task:processHashtags] tags indexed on content row",
    )
  },
})
