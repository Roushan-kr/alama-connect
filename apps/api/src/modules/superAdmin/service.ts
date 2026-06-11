import { db } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { jitteredTtl } from "../../lib/cache.js";

// Cache Keys
const NETWORKS_LIST_KEY = "super:networks:list";
const PLATFORM_METRICS_KEY = "super:metrics";

export async function listNetworks() {
  const cached = await redis.get(NETWORKS_LIST_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  const networks = await db.network.findMany({
    select: {
      networkId: true,
      name: true,
      code: true,
      createdAt: true,
      _count: {
        select: {
          members: {
            where: { status: "VERIFIED" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const formatted = networks.map((n) => ({
    networkId: n.networkId,
    name: n.name,
    code: n.code,
    createdAt: n.createdAt,
    memberCount: n._count.members,
  }));

  await redis.setex(NETWORKS_LIST_KEY, jitteredTtl(120), JSON.stringify(formatted));
  return formatted;
}

export async function listNetworkAdmins(networkId: string) {
  const admins = await db.networkMember.findMany({
    where: { networkId, role: "ADMIN" },
    include: {
      user: {
        select: {
          email: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return admins.map((a) => ({
    userId: a.userId,
    fullName: a.user.profile?.fullName ?? null,
    email: a.user.email,
    joinedAt: a.joinedAt,
  }));
}

export async function updateNetworkAdminRole(
  networkId: string,
  userId: string,
  role: "ADMIN" | "FACULTY" | "ALUMNI" | "STUDENT",
  callerUserId: string,
) {
  await db.$transaction(async (tx) => {
    // Update role
    await tx.networkMember.update({
      where: { userId_networkId: { userId, networkId } },
      data: { role },
    });

    // Fetch details for audit description
    const targetUser = await tx.user.findUnique({
      where: { userId },
      include: { profile: { select: { fullName: true } } },
    });

    const targetName = targetUser?.profile?.fullName || targetUser?.username || userId;
    const auditBody = `User ${targetName} network role updated to ${role} by Super Admin.`;

    // Create Announcement row for audit trail
    await tx.content.create({
      data: {
        networkId,
        contentType: "ANNOUNCEMENT",
        title: "Role Audit Trail",
        body: auditBody,
        createdBy: callerUserId,
        visibility: "NETWORK",
      },
    });
  });

  // Invalidate profile cache
  await redis.del(`profile:${userId}`);

  // Invalidate networks list cache
  await redis.del(NETWORKS_LIST_KEY);
  await redis.del(PLATFORM_METRICS_KEY);
}

export async function globalUserSearch(
  query: string,
  limit: number,
  cursor?: string,
) {
  const where: any = {};

  if (query) {
    const cleanQuery = query.trim();
    where.OR = [
      { email: { contains: cleanQuery, mode: "insensitive" } },
      { username: { contains: cleanQuery, mode: "insensitive" } },
      {
        profile: {
          fullName: { contains: cleanQuery, mode: "insensitive" },
        },
      },
    ];
  }

  if (cursor) {
    where.userId = { gt: cursor };
  }

  const users = await db.user.findMany({
    where,
    select: {
      userId: true,
      email: true,
      username: true,
      globalRole: true,
      emailVerified: true,
      profile: {
        select: {
          fullName: true,
          profileImage: true,
        },
      },
    },
    orderBy: { userId: "asc" },
    take: limit + 1,
  });

  const hasMore = users.length > limit;
  const items = hasMore ? users.slice(0, limit) : users;
  const nextCursor = hasMore ? (items.at(-1)?.userId ?? null) : null;

  return { data: items, nextCursor };
}

export async function disableUser(
  userId: string,
  reason: string,
  callerUserId: string,
) {
  if (userId === callerUserId) {
    throw Object.assign(new Error("Cannot disable your own account"), {
      statusCode: 400,
      code: "SELF_DISABLE_FORBIDDEN",
    });
  }

  await db.$transaction([
    // Set emailVerified to false to lock them out
    db.user.update({
      where: { userId },
      data: { emailVerified: false },
    }),
    // Delete all user sessions
    db.session.deleteMany({
      where: { userId },
    }),
    // Update disabledAt and reason in UserSettings
    db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        disabledAt: new Date(),
        disabledReason: reason,
      },
      update: {
        disabledAt: new Date(),
        disabledReason: reason,
      },
    }),
  ]);

  // Set disabled state in Redis cache
  await redis.setex(`user:disabled:${userId}`, 60, "1");

  // Invalidate profile cache
  await redis.del(`profile:${userId}`);
  await redis.del(PLATFORM_METRICS_KEY);
}

export async function getPlatformMetrics() {
  const cached = await redis.get(PLATFORM_METRICS_KEY);
  if (cached) {
    return JSON.parse(cached);
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalVerifiedUsers,
    totalNetworks,
    totalPosts,
    totalCampaignsSent,
  ] = await db.$transaction([
    db.user.count(),
    db.networkMember.count({ where: { status: "VERIFIED" } }),
    db.network.count(),
    db.content.count({
      where: {
        contentType: "SOCIAL_POST",
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    db.emailCampaign.count({
      where: { status: "COMPLETE" },
    }),
  ]);

  const metrics = {
    totalUsers,
    totalVerifiedUsers,
    totalNetworks,
    totalPosts,
    totalCampaignsSent,
  };

  await redis.setex(PLATFORM_METRICS_KEY, jitteredTtl(300), JSON.stringify(metrics));
  return metrics;
}
