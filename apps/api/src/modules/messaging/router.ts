/**
 * src/modules/messaging/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  CreateConversationSchema,
  SendMessageSchema,
  ListMessagesSchema,
} from "./schemas.js";
import {
  getOrCreateConversation,
  listConversations,
  listMessages,
  sendMessage,
  markRead,
} from "./service.js";
import { logger } from "../../config/logger.js";

export const messagingRouter: FastifyPluginAsync = async (fastify) => {
  // Get or Create Conversation (requires mutual connection check)
  fastify.post("/conversations", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = CreateConversationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await getOrCreateConversation(request.user.userId, parsed.data.targetUserId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List Conversations
  fastify.get("/conversations", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    try {
      const result = await listConversations(request.user.userId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List Messages in Conversation
  fastify.get("/conversations/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    const parsed = ListMessagesSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    const { cursor, cursorId, limit } = parsed.data;

    try {
      const result = await listMessages(id, request.user.userId, cursor, cursorId, limit);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Send Message
  fastify.post("/conversations/:id/messages", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    const parsed = SendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await sendMessage(id, request.user.userId, parsed.data.body);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Mark Messages as Read
  fastify.post("/conversations/:id/read", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };
    const { messageId } = request.body as { messageId?: string };

    if (!messageId) {
      return reply.status(400).send({
        error: "messageId is required",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await markRead(id, request.user.userId, messageId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });
};

async function handleError(err: unknown, reply: import("fastify").FastifyReply) {
  const e = err as Error;
  if (e.message.includes("not found")) {
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

  logger.error({ err }, "[Messaging] error in route handler");
  return reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  });
}
