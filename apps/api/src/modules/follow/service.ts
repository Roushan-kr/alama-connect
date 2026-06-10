/**
 * src/modules/follow/service.ts
 */

import type { AuthorSummary, PaginationMeta } from "@alumni/shared"
import { db } from "../../config/db.js"

type ServiceError = Error & { code?: string; status?: number }

function toAuthor(user: {
  userId: string
  username: string
  profile: {
    fullName: string | null
    headline: string | null
    profileImage: string | null
  } | null
}): AuthorSummary {
  return {
    userId: user.userId,
    username: user.username,
    fullName: user.profile?.fullName ?? null,
    headline: user.profile?.headline ?? null,
    profileImage: user.profile?.profileImage ?? null,
  }
}

export async function followUser(
  followerId: string,
  followeeId: string,
): Promise<void> {
  if (followerId === followeeId) {
    throw Object.assign(new Error("You cannot follow yourself"), {
      code: "VALIDATION_ERROR",
      status: 400,
    })
  }

  const followee = await db.user.findUnique({
    where: { userId: followeeId },
    select: { userId: true },
  })

  if (!followee) {
    throw Object.assign(new Error("User not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  await db.follow.upsert({
    where: {
      followerId_followeeId: { followerId, followeeId },
    },
    create: { followerId, followeeId },
    update: {},
  })
}

export async function unfollowUser(
  followerId: string,
  followeeId: string,
): Promise<void> {
  await db.follow.deleteMany({
    where: { followerId, followeeId },
  })
}

export interface FollowListPage {
  data: AuthorSummary[]
  meta: PaginationMeta
}

async function listFollowUsers(
  field: "followerId" | "followeeId",
  userId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<FollowListPage> {
  let cursorDate: Date | undefined
  let cursorFollowerId: string | undefined
  let cursorFolloweeId: string | undefined

  if (query.cursor) {
    const row = await db.follow.findFirst({
      where:
        field === "followeeId"
          ? { followeeId: userId, followerId: query.cursor }
          : { followerId: userId, followeeId: query.cursor },
      select: { createdAt: true, followerId: true, followeeId: true },
    })
    if (!row) {
      throw Object.assign(new Error("Invalid cursor"), {
        code: "VALIDATION_ERROR",
        status: 400,
      })
    }
    cursorDate = row.createdAt
    cursorFollowerId = row.followerId
    cursorFolloweeId = row.followeeId
  }

  const rows = await db.follow.findMany({
    where: {
      [field]: userId,
      ...(cursorDate
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              {
                createdAt: cursorDate,
                ...(field === "followeeId"
                  ? { followerId: { lt: cursorFollowerId! } }
                  : { followeeId: { lt: cursorFolloweeId! } }),
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followerId: "desc" }],
    take: query.limit + 1,
    include: {
      follower: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
      followee: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
    },
  })

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const last = page[page.length - 1]

  const data = page.map((row) =>
    toAuthor(field === "followeeId" ? row.follower : row.followee),
  )

  return {
    data,
    meta: {
      nextCursor:
        hasMore && last
          ? field === "followeeId"
            ? last.followerId
            : last.followeeId
          : null,
      hasMore,
      limit: query.limit,
    },
  }
}

export async function getFollowers(
  userId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<FollowListPage> {
  return listFollowUsers("followeeId", userId, query)
}

export async function getFollowing(
  userId: string,
  query: { cursor?: string | undefined; limit: number },
): Promise<FollowListPage> {
  return listFollowUsers("followerId", userId, query)
}

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof Error && "code" in err
}
