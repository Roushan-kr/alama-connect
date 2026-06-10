/**
 * src/modules/follow/router.ts
 *
 * Routes:
 *   POST   /api/follow/:userId
 *   DELETE /api/follow/:userId
 *   GET    /api/users/:userId/followers  (registered under users prefix)
 *   GET    /api/users/:userId/following
 */

import type { FastifyPluginAsync } from "fastify"
import { FollowUserParamsSchema } from "./schemas.js"
import { followUser, unfollowUser, isServiceError } from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"

export const followRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = FollowUserParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid user ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await followUser(request.user.userId, params.data.userId)
        return reply.status(200).send({ data: { following: true } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.delete(
    "/:userId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = FollowUserParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid user ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await unfollowUser(request.user.userId, params.data.userId)
        return reply.status(200).send({ data: { following: false } })
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

  logger.error({ err }, "[Follow] unhandled error")
  await reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  })
}
