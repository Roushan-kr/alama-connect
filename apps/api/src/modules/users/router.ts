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
import {
  UpdateProfileSchema,
  CreateExperienceSchema,
  UpdateExperienceSchema,
  ExperienceIdParamsSchema,
  AddSkillSchema,
  SkillIdParamsSchema,
} from "./schemas.js"
import {
  getMe,
  updateMe,
  getUserById,
  getMyEducation,
  createExperience,
  updateExperience,
  deleteExperience,
  addSkill,
  removeSkill,
} from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"
import {
  FollowUserParamsSchema,
  FollowListQuerySchema,
} from "../follow/schemas.js"
import { getFollowers, getFollowing, isServiceError as isFollowError } from "../follow/service.js"

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

  // ── GET /api/users/me/education ─────────────────────────────────────────────
  fastify.get(
    "/me/education",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      try {
        const education = await getMyEducation(request.user.userId)
        return reply.status(200).send({ data: education })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  // ── Work experience CRUD ────────────────────────────────────────────────────
  fastify.post(
    "/me/experience",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const parsed = CreateExperienceSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }
      try {
        const exp = await createExperience(request.user.userId, parsed.data)
        return reply.status(201).send({ data: exp })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.put(
    "/me/experience/:expId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = ExperienceIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid experience ID",
          code: "VALIDATION_ERROR",
        })
      }
      const parsed = UpdateExperienceSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }
      try {
        const exp = await updateExperience(
          request.user.userId,
          params.data.expId,
          parsed.data,
        )
        return reply.status(200).send({ data: exp })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.delete(
    "/me/experience/:expId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = ExperienceIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid experience ID",
          code: "VALIDATION_ERROR",
        })
      }
      try {
        await deleteExperience(request.user.userId, params.data.expId)
        return reply.status(200).send({ data: { deleted: true } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  // ── Skills ──────────────────────────────────────────────────────────────────
  fastify.post(
    "/me/skills",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const parsed = AddSkillSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }
      try {
        const skill = await addSkill(request.user.userId, parsed.data)
        return reply.status(201).send({ data: skill })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.delete(
    "/me/skills/:skillId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = SkillIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid skill ID",
          code: "VALIDATION_ERROR",
        })
      }
      try {
        await removeSkill(request.user.userId, params.data.skillId)
        return reply.status(200).send({ data: { removed: true } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  // ── GET /api/users/:userId/followers & /following (before /:userId) ───────
  fastify.get(
    "/:userId/followers",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = FollowUserParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid user ID",
          code: "VALIDATION_ERROR",
        })
      }
      const query = FollowListQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({
          error: query.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }
      try {
        const page = await getFollowers(params.data.userId, query.data)
        return reply.status(200).send(page)
      } catch (err: unknown) {
        return handleFollowError(err, reply)
      }
    },
  )

  fastify.get(
    "/:userId/following",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = FollowUserParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid user ID",
          code: "VALIDATION_ERROR",
        })
      }
      const query = FollowListQuerySchema.safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({
          error: query.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }
      try {
        const page = await getFollowing(params.data.userId, query.data)
        return reply.status(200).send(page)
      } catch (err: unknown) {
        return handleFollowError(err, reply)
      }
    },
  )

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

async function handleFollowError(
  err: unknown,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  if (isFollowError(err) && err.status && err.status < 500) {
    await reply.status(err.status).send({
      error: err.message,
      code: err.code ?? "ERROR",
    })
    return
  }
  logger.error({ err }, "[Users/Follow] unhandled error")
  await reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  })
}
