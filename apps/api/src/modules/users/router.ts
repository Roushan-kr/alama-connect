/**
 * src/modules/users/router.ts
 *
 * Fastify route plugin for the users/profile module.
 *
 * Routes:
 *   GET  /api/users/me
 *   PUT  /api/users/me
 *   GET  /api/users/:userId
 */

import type { FastifyPluginAsync } from "fastify"
import { UpdateProfileSchema } from "./schemas.js"
import { getMe, updateMe, getUserById } from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"

export const usersRouter: FastifyPluginAsync = async (fastify) => {
  // ── GET /api/users/me ───────────────────────────────────────────────────────
  fastify.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return

    try {
      const profile = await getMe(request.user.userId)
      return reply.status(200).send({ data: profile })
    } catch (err: unknown) {
      return handleError(err, reply)
    }
  })

  // ── PUT /api/users/me ───────────────────────────────────────────────────────
  fastify.put("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return

    const parsed = UpdateProfileSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      })
    }

    try {
      await updateMe(request.user.userId, parsed.data)
      return reply.status(200).send({ data: { message: "Profile updated" } })
    } catch (err: unknown) {
      return handleError(err, reply)
    }
  })

  // ── GET /api/users/:userId ──────────────────────────────────────────────────
  fastify.get("/:userId", { preHandler: [requireAuth] }, async (request, reply) => {
    const { userId } = request.params as { userId: string }

    // UUID validation.
    if (!/^[0-9a-f-]{36}$/.test(userId)) {
      return reply.status(400).send({
        error: "Invalid user ID format",
        code: "VALIDATION_ERROR",
      })
    }

    try {
      const profile = await getUserById(userId)
      return reply.status(200).send({ data: profile })
    } catch (err: unknown) {
      return handleError(err, reply)
    }
  })
}

// ── Error Handler ─────────────────────────────────────────────────────────────

type ServiceError = Error & { code?: string; status?: number }

async function handleError(err: unknown, reply: import("fastify").FastifyReply): Promise<void> {
  const error = err as ServiceError
  const status = error.status ?? 500
  const code = error.code ?? "INTERNAL_ERROR"
  const message = status < 500 ? error.message : "An internal server error occurred"

  if (status >= 500) {
    logger.error({ err: error }, "[Users] unhandled error")
  }

  await reply.status(status).send({ error: message, code })
}
