/**
 * src/modules/posts/router.ts
 *
 * Routes:
 *   POST   /api/posts
 *   POST   /api/posts/:contentId/like
 *   DELETE /api/posts/:contentId/like
 *   POST   /api/posts/:contentId/comments
 *   GET    /api/posts/:contentId/comments
 */

import type { FastifyPluginAsync } from "fastify"
import { CreatePostSchema } from "../feed/schemas.js"
import { createPost } from "../feed/service.js"
import {
  ContentIdParamsSchema,
  CreateCommentSchema,
  CommentsQuerySchema,
  CommentIdParamsSchema,
} from "./schemas.js"
import {
  likePost,
  unlikePost,
  createComment,
  getComments,
  deleteComment,
  isServiceError,
} from "./service.js"
import { requireAuth } from "../../middleware/requireAuth.js"
import { logger } from "../../config/logger.js"

export const postsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return

    let fields: Record<string, string> = {}
    const imageFiles: Array<{ buffer: Buffer; filename: string; mimeType: string }> =
      []

    try {
      const parts = request.parts()
      for await (const part of parts) {
        if (part.type === "file") {
          if (!part.mimetype.startsWith("image/")) {
            return reply.status(400).send({
              error: "Only image uploads are supported for posts",
              code: "VALIDATION_ERROR",
            })
          }
          imageFiles.push({
            buffer: await part.toBuffer(),
            filename: part.filename,
            mimeType: part.mimetype,
          })
        } else {
          fields[part.fieldname] = part.value as string
        }
      }
    } catch (err) {
      logger.error({ err }, "[Posts] multipart parsing exception");
      return reply.status(400).send({
        error: "Invalid multipart request",
        code: "VALIDATION_ERROR",
      })
    }

    const parsed = CreatePostSchema.safeParse({
      networkId: fields["networkId"],
      groupId: fields["groupId"] || undefined,
      body: fields["body"],
      title: fields["title"],
      visibility: fields["visibility"],
    })

    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      })
    }

    if (imageFiles.length > 4) {
      return reply.status(400).send({
        error: "Maximum 4 images per post",
        code: "VALIDATION_ERROR",
      })
    }

    try {
      const result = await createPost({
        userId: request.user.userId,
        input: parsed.data,
        imageFiles,
      })
      return reply.status(201).send({ data: result })
    } catch (err: unknown) {
      return handleError(err, reply)
    }
  })

  fastify.post(
    "/:contentId/like",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = ContentIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid content ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await likePost(request.user.userId, params.data.contentId)
        return reply.status(200).send({ data: { liked: true } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.delete(
    "/:contentId/like",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = ContentIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid content ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await unlikePost(request.user.userId, params.data.contentId)
        return reply.status(200).send({ data: { liked: false } })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.post(
    "/:contentId/comments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = ContentIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid content ID",
          code: "VALIDATION_ERROR",
        })
      }

      const parsed = CreateCommentSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }

      try {
        const result = await createComment(
          request.user.userId,
          params.data.contentId,
          parsed.data,
        )
        return reply.status(201).send({ data: result })
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )

  fastify.get(
    "/:contentId/comments",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = ContentIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid content ID",
          code: "VALIDATION_ERROR",
        })
      }

      const parsed = CommentsQuerySchema.safeParse(request.query)
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        })
      }

      try {
        const page = await getComments(params.data.contentId, parsed.data)
        return reply.status(200).send(page)
      } catch (err: unknown) {
        return handleError(err, reply)
      }
    },
  )
}

export const commentsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.delete(
    "/:commentId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return
      const params = CommentIdParamsSchema.safeParse(request.params)
      if (!params.success) {
        return reply.status(400).send({
          error: "Invalid comment ID",
          code: "VALIDATION_ERROR",
        })
      }

      try {
        await deleteComment(request.user.userId, params.data.commentId)
        return reply.status(200).send({ data: { deleted: true } })
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

  logger.error({ err }, "[Posts] unhandled error")
  await reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  })
}
