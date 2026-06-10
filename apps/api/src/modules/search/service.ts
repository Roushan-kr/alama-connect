/**
 * src/modules/search/service.ts
 */

import { db } from "@/config/db.js";
import { Prisma } from "@prisma/client";

export interface SearchResultItem {
  id: string;
  type: "user" | "content" | "job";
  title?: string | null;
  body?: string | null;
  createdAt: Date;
  rank: number;
  metadata: Record<string, any>;
}

/**
 * Full-text search users within a network.
 */
export async function searchUsers(
  networkId: string,
  q: string,
  limit: number,
  cursor?: string
): Promise<SearchResultItem[]> {
  const queryParts = [
    Prisma.sql`
      SELECT 
        p.user_id AS "userId", 
        p.full_name AS "fullName", 
        p.headline AS "headline", 
        p.bio AS "bio", 
        p.profile_image AS "profileImage", 
        u.username AS "username",
        p.created_at AS "createdAt",
        ts_rank(p.search_vector, plainto_tsquery('english', ${q})) AS "rank"
      FROM profiles p
      JOIN users u ON p.user_id = u.user_id
      JOIN network_members nm ON p.user_id = nm.user_id
      WHERE nm.network_id = ${networkId}::uuid
        AND nm.status = 'VERIFIED'
        AND p.search_vector @@ plainto_tsquery('english', ${q})
    `,
  ];

  if (cursor) {
    queryParts.push(Prisma.sql`AND p.created_at < ${new Date(cursor)}`);
  }

  queryParts.push(Prisma.sql`
    ORDER BY "rank" DESC, p.created_at DESC, p.user_id ASC
    LIMIT ${limit}::integer
  `);

  const rows = await db.$queryRaw<any[]>(Prisma.join(queryParts, " "));

  return rows.map((row) => ({
    id: row.userId,
    type: "user",
    title: row.fullName || row.username,
    body: row.headline || row.bio || "",
    createdAt: new Date(row.createdAt),
    rank: Number(row.rank),
    metadata: {
      username: row.username,
      profileImage: row.profileImage,
    },
  }));
}

/**
 * Full-text search content (posts, announcements, newsletters) in a network.
 */
export async function searchContent(
  networkId: string,
  q: string,
  limit: number,
  cursor?: string
): Promise<SearchResultItem[]> {
  const queryParts = [
    Prisma.sql`
      SELECT 
        c.content_id AS "contentId",
        c.content_type AS "contentType",
        c.title AS "title",
        c.body AS "body",
        c.created_at AS "createdAt",
        c.visibility AS "visibility",
        c.tags AS "tags",
        u.user_id AS "userId",
        u.username AS "username",
        p.full_name AS "fullName",
        p.profile_image AS "profileImage",
        ts_rank(c.search_vector, plainto_tsquery('english', ${q})) AS "rank"
      FROM content c
      JOIN users u ON c.created_by = u.user_id
      LEFT JOIN profiles p ON u.user_id = p.user_id
      WHERE c.network_id = ${networkId}::uuid
        AND c.visibility IN ('PUBLIC', 'NETWORK')
        AND c.search_vector @@ plainto_tsquery('english', ${q})
    `,
  ];

  if (cursor) {
    queryParts.push(Prisma.sql`AND c.created_at < ${new Date(cursor)}`);
  }

  queryParts.push(Prisma.sql`
    ORDER BY c.created_at DESC, c.content_id DESC
    LIMIT ${limit}::integer
  `);

  const rows = await db.$queryRaw<any[]>(Prisma.join(queryParts, " "));

  return rows.map((row) => ({
    id: row.contentId,
    type: "content",
    title: row.title,
    body: row.body,
    createdAt: new Date(row.createdAt),
    rank: Number(row.rank),
    metadata: {
      contentType: row.contentType,
      visibility: row.visibility,
      tags: row.tags,
      author: {
        userId: row.userId,
        username: row.username,
        fullName: row.fullName,
        profileImage: row.profileImage,
      },
    },
  }));
}

/**
 * Full-text search jobs in a network.
 */
export async function searchJobs(
  networkId: string,
  q: string,
  limit: number,
  cursor?: string
): Promise<SearchResultItem[]> {
  const queryParts = [
    Prisma.sql`
      SELECT 
        j.job_id AS "jobId",
        j.content_id AS "contentId",
        j.title AS "title",
        j.description AS "description",
        j.location AS "location",
        j.apply_link AS "applyLink",
        j.tags AS "tags",
        j.expires_at AS "expiresAt",
        j.created_at AS "createdAt",
        u.user_id AS "userId",
        u.username AS "username",
        p.full_name AS "fullName",
        p.profile_image AS "profileImage",
        ts_rank(c.search_vector, plainto_tsquery('english', ${q})) AS "rank"
      FROM jobs j
      JOIN content c ON j.content_id = c.content_id
      JOIN users u ON j.posted_by = u.user_id
      LEFT JOIN profiles p ON u.user_id = p.user_id
      WHERE j.network_id = ${networkId}::uuid
        AND (j.expires_at IS NULL OR j.expires_at > NOW())
        AND c.search_vector @@ plainto_tsquery('english', ${q})
    `,
  ];

  if (cursor) {
    queryParts.push(Prisma.sql`AND j.created_at < ${new Date(cursor)}`);
  }

  queryParts.push(Prisma.sql`
    ORDER BY j.created_at DESC, j.job_id DESC
    LIMIT ${limit}::integer
  `);

  const rows = await db.$queryRaw<any[]>(Prisma.join(queryParts, " "));

  return rows.map((row) => ({
    id: row.jobId,
    type: "job",
    title: row.title,
    body: row.description,
    createdAt: new Date(row.createdAt),
    rank: Number(row.rank),
    metadata: {
      contentId: row.contentId,
      location: row.location,
      applyLink: row.applyLink,
      tags: row.tags,
      expiresAt: row.expiresAt,
      poster: {
        userId: row.userId,
        username: row.username,
        fullName: row.fullName,
        profileImage: row.profileImage,
      },
    },
  }));
}
