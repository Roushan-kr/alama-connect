/**
 * src/modules/posts/schemas.ts
 */

import { z } from "zod"
import { PaginationQuerySchema } from "@alumni/shared"

export const ContentIdParamsSchema = z.object({
  contentId: z.uuid(),
})
export type ContentIdParams = z.infer<typeof ContentIdParamsSchema>

export const CommentIdParamsSchema = z.object({
  commentId: z.uuid(),
})
export type CommentIdParams = z.infer<typeof CommentIdParamsSchema>

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  parentId: z.uuid().optional(),
})
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>

export const CommentsQuerySchema = PaginationQuerySchema
export type CommentsQuery = z.infer<typeof CommentsQuerySchema>
