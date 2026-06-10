import { z } from "zod"
import { PaginationQuerySchema } from "@alumni/shared"

export const FollowUserParamsSchema = z.object({
  userId: z.uuid(),
})
export type FollowUserParams = z.infer<typeof FollowUserParamsSchema>

export const FollowListQuerySchema = PaginationQuerySchema
export type FollowListQuery = z.infer<typeof FollowListQuerySchema>
