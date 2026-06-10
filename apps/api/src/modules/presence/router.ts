/**
 * src/modules/presence/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@/middleware/requireAuth.js";
import { redis } from "@/config/redis.js";

export const presenceRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const { userIds } = request.query as { userIds?: string };

    if (!userIds || typeof userIds !== "string") {
      return reply.status(400).send({
        error: "userIds query parameter is required as a comma-separated list of UUIDs",
        code: "VALIDATION_ERROR",
      });
    }

    const ids = userIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) {
      return reply.status(200).send({ data: {} });
    }

    try {
      const keys = ids.map((id) => `presence:${id}:online`);
      const results = await redis.mget(keys);

      const presenceMap: Record<string, boolean> = {};
      ids.forEach((id, index) => {
        presenceMap[id] = results[index] === "1";
      });

      return reply.status(200).send({ data: presenceMap });
    } catch (err: unknown) {
      return reply.status(500).send({
        error: "Failed to fetch presence data",
        code: "INTERNAL_ERROR",
      });
    }
  });
};
