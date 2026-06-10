/**
 * src/modules/notifications/router.ts
 *
 * Routes:
 *   GET  /api/notifications
 *   POST /api/notifications/:notifId/read
 *   POST /api/notifications/read-all
 */

import type { FastifyPluginAsync } from "fastify"
import { NotificationsQuerySchema, NotifIdParamsSchema } from "./schemas.js"
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  isServiceError,
} from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"

export const notificationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return

    const parsed = NotificationsQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      })
    }

    try {
      const page = await listNotifications(request.user.userId, parsed.data)
      return reply.status(200).send(page)
    } catch (err: unknown) {
      return handleError(err, reply)
    }
  })

  fastify.post(
    "/read-all",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return

      try {
        const count = await markAllNotificationsRead(request.user.userId)
        return reply.status(200).send({ data: { marked: count } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.post(
    "/:notifId/read",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return

      const params = NotifIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid notification ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await markNotificationRead(request.user.userId, params.data.notifId)
        return reply.status(200).send({ data: { read: true } })
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

  logger.error({ err }, "[Notifications] unhandled error")
  await reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  })
}
