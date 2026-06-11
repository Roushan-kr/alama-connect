/**
 * src/modules/connections/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@/middleware/requireAuth.js";
import {
  SendConnectionRequestSchema,
  RespondConnectionRequestSchema,
  ListConnectionsSchema,
  DiscoverPeersSchema,
} from "./schemas.js";
import {
  sendRequest,
  respondToRequest,
  listConnections,
  listPendingRequests,
  removeConnection,
  discoverPeers,
} from "./service.js";
import { logger } from "@/config/logger.js";
import { redis } from "@/config/redis.js";


export const connectionsRouter: FastifyPluginAsync = async (fastify) => {
  // Send connection request
  fastify.post("/request", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    // Rate limit connection requests to 20 per hour
    const rateLimitKey = `rl:connections:request:${request.user.userId}`;
    const count = await redis.incr(rateLimitKey);
    if (count === 1) {
      await redis.expire(rateLimitKey, 3600);
    }
    if (count > 20) {
      return reply.status(429).send({
        error: "Connection request rate limit exceeded (20/hour). Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    const parsed = SendConnectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await sendRequest(request.user.userId, parsed.data.toUserId);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Discover peers in the user's verified networks
  fastify.get("/discover", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = DiscoverPeersSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await discoverPeers(
        request.user.userId,
        parsed.data.networkId,
        parsed.data.limit,
        parsed.data.cursor,
        parsed.data.q
      );
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Respond to connection request
  fastify.patch("/request/:reqId", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { reqId } = request.params as { reqId: string };

    const parsed = RespondConnectionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await respondToRequest(request.user.userId, reqId, parsed.data.action);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List user's active connections
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = ListConnectionsSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    const { limit, cursor } = parsed.data;

    try {
      const result = await listConnections(request.user.userId, limit, cursor);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List user's pending received requests
  fastify.get("/pending", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    try {
      const result = await listPendingRequests(request.user.userId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Remove connection
  fastify.delete("/:targetUserId", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { targetUserId } = request.params as { targetUserId: string };

    try {
      const result = await removeConnection(request.user.userId, targetUserId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });
};

async function handleError(err: unknown, reply: import("fastify").FastifyReply) {
  const e = err as Error;
  if (
    e.message.includes("not found") ||
    e.message.includes("not exist")
  ) {
    return reply.status(404).send({
      error: e.message,
      code: "NOT_FOUND",
    });
  }
  if (e.message.includes("Unauthorized")) {
    return reply.status(403).send({
      error: e.message,
      code: "FORBIDDEN",
    });
  }
  if (
    e.message.includes("Cannot send") ||
    e.message.includes("already connected") ||
    e.message.includes("already exists") ||
    e.message.includes("already been processed")
  ) {
    return reply.status(400).send({
      error: e.message,
      code: "BAD_REQUEST",
    });
  }

  logger.error({ err }, "[Connections] error in route handler");
  return reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  });
}
