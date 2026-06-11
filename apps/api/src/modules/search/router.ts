/**
 * src/modules/search/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@/middleware/requireAuth.js";
import { SearchSchema } from "./schemas.js";
import { searchUsers, searchContent, searchJobs, type SearchResultItem } from "./service.js";
import { db } from "@/config/db.js";
import { logger } from "@/config/logger.js";

export const searchRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = SearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    const { q, networkId, type, limit, cursor } = parsed.data;

    // Verify network membership (bypass for SUPER_ADMIN)
    if (request.user.globalRole !== "SUPER_ADMIN") {
      const membership = await db.networkMember.findUnique({
        where: {
          userId_networkId: {
            userId: request.user.userId,
            networkId,
          },
        },
        select: { status: true },
      });

      if (!membership || membership.status !== "VERIFIED") {
        return reply.status(403).send({
          error: "Access restricted to verified network members only",
          code: "FORBIDDEN",
        });
      }
    }

    try {
      let results: SearchResultItem[] = [];

      if (type === "users") {
        results = await searchUsers(networkId, q, limit, cursor);
      } else if (type === "content" || type === "posts") {
        results = await searchContent(networkId, q, limit, cursor);
      } else if (type === "jobs") {
        results = await searchJobs(networkId, q, limit, cursor);
      } else {
        // type === "all", run in parallel
        const [users, content, jobs] = await Promise.all([
          searchUsers(networkId, q, limit, cursor),
          searchContent(networkId, q, limit, cursor),
          searchJobs(networkId, q, limit, cursor),
        ]);

        results = [...users, ...content, ...jobs]
          .sort((a, b) => b.rank - a.rank)
          .slice(0, limit);
      }

      // Keyset pagination metadata
      const hasNextPage = results.length >= limit;
      // We can use the last item's createdAt as nextCursor if we are paginating
      const lastResult = results[results.length - 1];
      const nextCursor =
        hasNextPage && lastResult && lastResult.createdAt
          ? new Date(lastResult.createdAt).toISOString()
          : undefined;

      return reply.status(200).send({
        data: results,
        nextCursor,
      });
    } catch (err: unknown) {
      logger.error({ err, q, networkId, type }, "[Search] error searching");
      return reply.status(500).send({
        error: "An error occurred while executing the search",
        code: "INTERNAL_ERROR",
      });
    }
  });
};
