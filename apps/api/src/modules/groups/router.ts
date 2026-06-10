/**
 * src/modules/groups/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  CreateGroupSchema,
  UpdateGroupSchema,
  InviteMemberSchema,
} from "./schemas.js";
import {
  createGroup,
  listGroups,
  getGroup,
  joinGroup,
  inviteMember,
  removeMember,
  updateGroup,
  deleteGroup,
} from "./service.js";
import { logger } from "../../config/logger.js";

export const groupsRouter: FastifyPluginAsync = async (fastify) => {
  // Create Group
  fastify.post("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = CreateGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await createGroup(
        request.user.userId,
        parsed.data.networkId,
        parsed.data
      );
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List Groups
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { networkId } = request.query as { networkId?: string };

    if (!networkId) {
      return reply.status(400).send({
        error: "networkId query parameter is required",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await listGroups(networkId, request.user.userId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Get Group Details
  fastify.get("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    try {
      const result = await getGroup(id, request.user.userId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Update Group
  fastify.patch("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    const parsed = UpdateGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await updateGroup(id, request.user.userId, parsed.data);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Delete Group
  fastify.delete("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    try {
      await deleteGroup(id, request.user.userId);
      return reply.status(200).send({ data: { deleted: true } });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Join Group
  fastify.post("/:id/join", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    try {
      const result = await joinGroup(id, request.user.userId);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Invite Member
  fastify.post("/:id/members/invite", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    const parsed = InviteMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await inviteMember(id, request.user.userId, parsed.data.userId);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Remove Member
  fastify.delete("/:id/members/:uid", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id, uid } = request.params as { id: string; uid: string };

    try {
      await removeMember(id, request.user.userId, uid);
      return reply.status(200).send({ data: { removed: true } });
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
  if (e.message.includes("Unauthorized") || e.message.includes("denied")) {
    return reply.status(403).send({
      error: e.message,
      code: "FORBIDDEN",
    });
  }

  logger.error({ err }, "[Groups] error in route handler");
  return reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  });
}
