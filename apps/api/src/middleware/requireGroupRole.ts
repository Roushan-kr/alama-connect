import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../config/db.js";

const ROLE_WEIGHT = {
  MEMBER: 1,
  MODERATOR: 2,
  ADMIN: 3,
} as const;

export function requireGroupRole(minRole: "MODERATOR" | "ADMIN") {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    const { groupId } = request.params as { groupId?: string };

    if (!groupId) {
      return reply.status(400).send({
        error: "Group ID is required for this operation",
        code: "MISSING_GROUP_ID",
      });
    }

    // UUID regex check to prevent database queries throwing on malformed UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(groupId)) {
      return reply.status(403).send({
        error: "Insufficient group role",
        code: "GROUP_ROLE_REQUIRED",
      });
    }

    const member = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: request.user.userId,
        },
      },
    });

    if (!member) {
      return reply.status(403).send({
        error: "Insufficient group role",
        code: "GROUP_ROLE_REQUIRED",
      });
    }

    const userWeight = ROLE_WEIGHT[member.role as keyof typeof ROLE_WEIGHT] || 0;
    const minWeight = ROLE_WEIGHT[minRole];

    if (userWeight < minWeight) {
      return reply.status(403).send({
        error: "Insufficient group role",
        code: "GROUP_ROLE_REQUIRED",
      });
    }

    request.groupMember = member;
  };
}
