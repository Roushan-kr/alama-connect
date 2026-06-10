/**
 * src/modules/feed/router.ts
 *
 * Routes:
 *   GET /api/feed/global
 *   GET /api/feed/user/:userId
 */

import type { FastifyPluginAsync } from "fastify"
import { FeedQuerySchema, UserFeedParamsSchema } from "./schemas.js"
import { getGlobalFeed, getUserFeed, isServiceError } from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"

export const feedRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/global",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return

      const parsed = FeedQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }

      try {
        const page = await getGlobalFeed(request.user.userId, parsed.data)
        return reply.status(200).send(page)
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.get(
    "/user/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return

      const params = UserFeedParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: params.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }

      const parsed = FeedQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }

      try {
        const page = await getUserFeed(
          request.user.userId,
          params.data.userId,
          parsed.data,
        )
        return reply.status(200).send(page)
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )
}

async function handleError(
  err: unknown,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  if (isServiceError(err) && err.status && err.status < 500) {
    await reply.status(err.status).send({
      error: err.message,
      code: err.code ?? "ERROR",
    })
    return
  }

  logger.error({ err }, "[Feed] unhandled error")
  await reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  })
}
