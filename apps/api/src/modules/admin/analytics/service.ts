/**
 * src/modules/admin/analytics/service.ts
 */

import { db } from "@/config/db.js";
import { redis } from "@/config/redis.js";

export async function getNetworkAnalytics(networkId: string) {
  const cacheKey = `admin:analytics:${networkId}`;
  
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // If Redis fails, log and fallback to database query directly
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [membersCount, activeJobsCount, connectionsCount, postsCount] = await Promise.all([
    db.networkMember.count({
      where: { networkId, status: "VERIFIED" },
    }),
    db.job.count({
      where: {
        networkId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    }),
    db.connection.count({
      where: {
        a: { networkMemberships: { some: { networkId, status: "VERIFIED" } } },
        b: { networkMemberships: { some: { networkId, status: "VERIFIED" } } },
      },
    }),
    db.content.count({
      where: {
        networkId,
        contentType: "SOCIAL_POST",
        createdAt: { gte: sevenDaysAgo },
      },
    }),
  ]);

  const stats = {
    membersCount,
    activeJobsCount,
    connectionsCount,
    postsCount,
  };

  try {
    // Cache for 5 minutes (300 seconds) + random jitter up to 30 seconds
    const jitter = Math.floor(Math.random() * 30);
    const ttl = 300 + jitter;
    await redis.set(cacheKey, JSON.stringify(stats), "EX", ttl);
  } catch (err) {
    // Fail silently if Redis caching fails
  }

  return stats;
}
