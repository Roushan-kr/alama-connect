import { z } from "zod"
import { PaginationQuerySchema } from "@alumni/shared"

export const NotificationsQuerySchema = PaginationQuerySchema
export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>

export const NotifIdParamsSchema = z.object({
  notifId: z.uuid(),
})
export type NotifIdParams = z.infer<typeof NotifIdParamsSchema>
