/**
 * src/modules/admin/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@/middleware/requireAuth.js";
import { getNetworkAnalytics } from "./analytics/service.js";
import {
  CreateAnnouncementSchema,
  CreateNewsletterSchema,
} from "./announcements/schemas.js";
import {
  createAnnouncement,
  createNewsletter,
} from "./announcements/service.js";
import { db } from "@/config/db.js";
import { logger } from "@/config/logger.js";

export const adminRouter: FastifyPluginAsync = async (fastify) => {
  // GET admin analytics overview
  fastify.get("/analytics/:networkId", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { networkId } = request.params as { networkId: string };

    // Verify if current user is an admin of this network
    const membership = await db.networkMember.findUnique({
      where: {
        userId_networkId: {
          userId: request.user.userId,
          networkId,
        },
      },
      select: { role: true, status: true },
    });

    if (
      !membership ||
      membership.status !== "VERIFIED" ||
      membership.role !== "ADMIN"
    ) {
      return reply.status(403).send({
        error: "Access restricted to verified network administrators only",
        code: "FORBIDDEN",
      });
    }

    try {
      const stats = await getNetworkAnalytics(networkId);
      return reply.status(200).send({ data: stats });
    } catch (err: unknown) {
      logger.error({ err, networkId }, "[Admin Analytics] Failed to get stats");
      return reply.status(500).send({
        error: "Failed to load network analytics metrics",
        code: "INTERNAL_ERROR",
      });
    }
  });

  // POST create network announcement
  fastify.post("/announcements", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = CreateAnnouncementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await createAnnouncement(request.user.userId, parsed.data);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // POST create network newsletter
  fastify.post("/newsletters", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = CreateNewsletterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await createNewsletter(request.user.userId, parsed.data);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });
};

async function handleError(err: unknown, reply: import("fastify").FastifyReply) {
  const e = err as Error;
  if (e.message.includes("Unauthorized")) {
    return reply.status(403).send({
      error: e.message,
      code: "FORBIDDEN",
    });
  }
  if (e.message.includes("not found")) {
    return reply.status(404).send({
      error: e.message,
      code: "NOT_FOUND",
    });
  }

  logger.error({ err }, "[Admin Announcements] Route error");
  return reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  });
}
