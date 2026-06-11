import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireAdmin } from "../../middleware/requireRole.js";
import { db } from "../../config/db.js";
import { redis } from "../../config/redis.js";

export const memberManagementRouter: FastifyPluginAsync = async (fastify) => {
  // Check auth and admin permission scoping to networkId param
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireAdmin("networkId"));

  // GET /members
  fastify.get("/members", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    const { q, role, status, cursor, limit = 20 } = request.query as {
      q?: string;
      role?: string;
      status?: string;
      cursor?: string;
      limit?: string | number;
    };

    const parsedLimit = Math.min(100, Math.max(1, Number(limit || 20)));

    const where: any = {
      networkId,
    };

    if (role && role !== "ALL") {
      where.role = role;
    }

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (q) {
      const cleanQ = q.trim();
      where.user = {
        OR: [
          { email: { contains: cleanQ, mode: "insensitive" } },
          { username: { contains: cleanQ, mode: "insensitive" } },
          {
            profile: {
              fullName: { contains: cleanQ, mode: "insensitive" },
            },
          },
        ],
      };
    }

    if (cursor) {
      where.userId = { gt: cursor };
    }

    try {
      const members = await db.networkMember.findMany({
        where,
        select: {
          userId: true,
          role: true,
          status: true,
          joinedAt: true,
          user: {
            select: {
              email: true,
              username: true,
              profile: {
                select: {
                  fullName: true,
                  profileImage: true,
                },
              },
            },
          },
        },
        orderBy: { userId: "asc" },
        take: parsedLimit + 1,
      });

      const hasMore = members.length > parsedLimit;
      const items = hasMore ? members.slice(0, parsedLimit) : members;
      const nextCursor = hasMore ? (items.at(-1)?.userId ?? null) : null;

      return reply.status(200).send({
        data: items,
        meta: {
          nextCursor,
          hasMore,
          limit: parsedLimit,
        },
      });
    } catch (err: unknown) {
      return reply.status(500).send({
        error: "Failed to list members",
        code: "INTERNAL_ERROR",
      });
    }
  });

  // PUT /members/:userId/role
  fastify.put("/members/:userId/role", async (request, reply) => {
    if (!request.user) return;
    const { networkId, userId } = request.params as {
      networkId: string;
      userId: string;
    };
    const { role } = request.body as { role?: string };

    if (userId === request.user.userId) {
      return reply.status(400).send({
        error: "Cannot change your own role",
        code: "VALIDATION_ERROR",
      });
    }

    if (
      role !== "STUDENT" &&
      role !== "ALUMNI" &&
      role !== "FACULTY" &&
      role !== "ADMIN"
    ) {
      return reply.status(400).send({
        error: "Invalid network role. Must be STUDENT, ALUMNI, FACULTY, or ADMIN.",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const exists = await db.networkMember.findUnique({
        where: { userId_networkId: { userId, networkId } },
      });

      if (!exists) {
        return reply.status(404).send({
          error: "Network member not found",
          code: "NOT_FOUND",
        });
      }

      await db.networkMember.update({
        where: { userId_networkId: { userId, networkId } },
        data: { role },
      });

      // Invalidate profile cache
      await redis.del(`profile:${userId}`);

      return reply.status(200).send({ data: { userId, role } });
    } catch (err: unknown) {
      return reply.status(500).send({
        error: "Failed to update member role",
        code: "INTERNAL_ERROR",
      });
    }
  });

  // DELETE /members/:userId
  fastify.delete("/members/:userId", async (request, reply) => {
    if (!request.user) return;
    const { networkId, userId } = request.params as {
      networkId: string;
      userId: string;
    };

    if (userId === request.user.userId) {
      return reply.status(400).send({
        error: "Cannot remove yourself from the network",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const exists = await db.networkMember.findUnique({
        where: { userId_networkId: { userId, networkId } },
      });

      if (!exists) {
        return reply.status(404).send({
          error: "Network member not found",
          code: "NOT_FOUND",
        });
      }

      await db.networkMember.delete({
        where: { userId_networkId: { userId, networkId } },
      });

      // Invalidate profile cache
      await redis.del(`profile:${userId}`);

      return reply.status(200).send({ data: { userId } });
    } catch (err: unknown) {
      return reply.status(500).send({
        error: "Failed to remove member",
        code: "INTERNAL_ERROR",
      });
    }
  });
};
