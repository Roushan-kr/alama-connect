/**
 * src/modules/groups/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireGroupRole } from "../../middleware/requireGroupRole.js";
import { db } from "../../config/db.js";

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

  // DELETE /api/groups/:groupId/admin/posts/:contentId
  fastify.delete(
    "/:groupId/admin/posts/:contentId",
    { preHandler: [requireAuth, requireGroupRole("MODERATOR")] },
    async (request, reply) => {
      const { groupId, contentId } = request.params as {
        groupId: string;
        contentId: string;
      };

      try {
        const content = await db.content.findUnique({
          where: { contentId },
        });

        if (!content) {
          return reply.status(404).send({
            error: "Content not found",
            code: "NOT_FOUND",
          });
        }

        if (content.groupId !== groupId) {
          return reply.status(403).send({
            error: "Content not in this group",
            code: "CONTENT_GROUP_MISMATCH",
          });
        }

        const existingMeta = (content.meta as Record<string, any>) || {};

        await db.content.update({
          where: { contentId },
          data: {
            body: "[Removed by moderator]",
            title: null,
            fileUrl: null,
            previewUrl: null,
            tags: [],
            visibility: "GROUP",
            meta: {
              ...existingMeta,
              moderationNote: "removed by moderator",
            },
          },
        });

        return reply.status(200).send({ data: { contentId } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // DELETE /api/groups/:groupId/admin/comments/:commentId
  fastify.delete(
    "/:groupId/admin/comments/:commentId",
    { preHandler: [requireAuth, requireGroupRole("MODERATOR")] },
    async (request, reply) => {
      const { groupId, commentId } = request.params as {
        groupId: string;
        commentId: string;
      };

      try {
        const comment = await db.postComment.findUnique({
          where: { commentId },
          include: {
            content: {
              select: { groupId: true },
            },
          },
        });

        if (!comment) {
          return reply.status(404).send({
            error: "Comment not found",
            code: "NOT_FOUND",
          });
        }

        if (comment.content.groupId !== groupId) {
          return reply.status(403).send({
            error: "Comment not in this group",
            code: "COMMENT_GROUP_MISMATCH",
          });
        }

        await db.postComment.update({
          where: { commentId },
          data: {
            body: "[Removed by moderator]",
          },
        });

        return reply.status(200).send({ data: { commentId } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // PUT /api/groups/:groupId/admin/members/:userId
  fastify.put(
    "/:groupId/admin/members/:userId",
    { preHandler: [requireAuth, requireGroupRole("ADMIN")] },
    async (request, reply) => {
      const { groupId, userId } = request.params as {
        groupId: string;
        userId: string;
      };
      const { role } = request.body as { role?: string };

      if (role !== "MEMBER" && role !== "MODERATOR" && role !== "ADMIN") {
        return reply.status(400).send({
          error: "Invalid role. Role must be MEMBER, MODERATOR, or ADMIN.",
          code: "VALIDATION_ERROR",
        });
      }

      try {
        const exists = await db.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
        });

        if (!exists) {
          return reply.status(404).send({
            error: "Group member not found",
            code: "NOT_FOUND",
          });
        }

        const updated = await db.groupMember.update({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
          data: {
            role,
          },
        });

        return reply.status(200).send({ data: { userId, role: updated.role } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );

  // DELETE /api/groups/:groupId/admin/members/:userId
  fastify.delete(
    "/:groupId/admin/members/:userId",
    { preHandler: [requireAuth, requireGroupRole("ADMIN")] },
    async (request, reply) => {
      if (!request.user) return;
      const { groupId, userId } = request.params as {
        groupId: string;
        userId: string;
      };

      if (userId === request.user.userId) {
        return reply.status(400).send({
          error: "You cannot remove yourself from the group",
          code: "VALIDATION_ERROR",
        });
      }

      try {
        const exists = await db.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
        });

        if (!exists) {
          return reply.status(404).send({
            error: "Group member not found",
            code: "NOT_FOUND",
          });
        }

        await db.groupMember.delete({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
        });

        return reply.status(200).send({ data: { userId } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    }
  );
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
