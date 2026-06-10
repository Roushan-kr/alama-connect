/**
 * src/modules/feed/schemas.ts
 */

import { z } from "zod"
import { PaginationQuerySchema } from "@alumni/shared"

export const CreatePostSchema = z.object({
  networkId: z.uuid(),
  groupId: z.uuid().optional(),
  body: z.string().min(1).max(10_000),
  title: z.string().max(300).optional(),
  visibility: z.enum(["PUBLIC", "NETWORK", "GROUP"]).default("NETWORK"),
})
export type CreatePostInput = z.infer<typeof CreatePostSchema>

export const FeedQuerySchema = PaginationQuerySchema.extend({
  networkId: z.uuid().optional(),
  groupId: z.uuid().optional(),
})
export type FeedQuery = z.infer<typeof FeedQuerySchema>

export const UserFeedParamsSchema = z.object({
  userId: z.uuid(),
})
export type UserFeedParams = z.infer<typeof UserFeedParamsSchema>
