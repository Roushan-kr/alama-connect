/**
 * src/modules/notifications/service.ts
 */

import type { PaginationMeta } from "@alumni/shared"
import { db } from "../../config/db.js"

type ServiceError = Error & { code?: string; status?: number }

export interface NotificationItem {
  notifId: string
  type: string
  message: string
  link: string | null
  relatedId: string | null
  networkId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationsPage {
  data: NotificationItem[]
  meta: PaginationMeta
}

export async function listNotifications(
  userId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<NotificationsPage> {
  let cursorRow: { createdAt: Date; notifId: string; readAt: Date | null } | null =
    null

  if (query.cursor) {
    const row = await db.notification.findFirst({
      where: { notifId: query.cursor, userId },
      select: { createdAt: true, notifId: true, readAt: true },
    })
    if (!row) {
      throw Object.assign(new Error("Invalid notification cursor"), {
        code: "VALIDATION_ERROR",
        status: 400,
      })
    }
    cursorRow = row
  }

  const rows = await db.notification.findMany({
    where: {
      userId,
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              {
                createdAt: cursorRow.createdAt,
                notifId: { lt: cursorRow.notifId },
              },
            ],
          }
        : {}),
    },
    orderBy: [
      { readAt: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
      { notifId: "desc" },
    ],
    take: query.limit + 1,
    select: {
      notifId: true,
      type: true,
      message: true,
      link: true,
      relatedId: true,
      networkId: true,
      readAt: true,
      createdAt: true,
    },
  })

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const last = page[page.length - 1]

  return {
    data: page.map((n) => ({
      notifId: n.notifId,
      type: n.type,
      message: n.message,
      link: n.link,
      relatedId: n.relatedId,
      networkId: n.networkId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    meta: {
      nextCursor: hasMore && last ? last.notifId : null,
      hasMore,
      limit: query.limit,
    },
  }
}

export async function markNotificationRead(
  userId: string,
  notifId: string,
): Promise<void> {
  const result = await db.notification.updateMany({
    where: { notifId, userId, readAt: null },
    data: { readAt: new Date() },
  })

  if (result.count === 0) {
    const exists = await db.notification.findFirst({
      where: { notifId, userId },
    })
    if (!exists) {
      throw Object.assign(new Error("Notification not found"), {
        code: "NOT_FOUND",
        status: 404,
      })
    }
  }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return result.count
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof Error && "code" in err
}
