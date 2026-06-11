import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  listNetworks,
  listNetworkAdmins,
  updateNetworkAdminRole,
  globalUserSearch,
  disableUser,
  getPlatformMetrics,
} from "./service.js";
import {
  UpdateNetworkAdminRoleSchema,
  GlobalUserSearchSchema,
  DisableUserSchema,
  SuperAdminBroadcastSchema,
} from "./schemas.js";
import { logger } from "../../config/logger.js";

export const superAdminRouter: FastifyPluginAsync = async (fastify) => {
  // Global hooks for auth and super admin validation
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", async (request, reply) => {
    if (!request.user || request.user.globalRole !== "SUPER_ADMIN") {
      return reply.status(403).send({
        error: "Super admin required",
        code: "SUPER_ADMIN_REQUIRED",
      });
    }
  });

  // GET /networks
  fastify.get("/networks", async (request, reply) => {
    try {
      const data = await listNetworks();
      return reply.status(200).send({ data });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] listNetworks error");
    }
  });

  // GET /networks/:networkId/admins
  fastify.get("/networks/:networkId/admins", async (request, reply) => {
    const { networkId } = request.params as { networkId: string };
    try {
      const data = await listNetworkAdmins(networkId);
      return reply.status(200).send({ data });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] listNetworkAdmins error");
    }
  });

  // PUT /networks/:networkId/admins/:userId
  fastify.put("/networks/:networkId/admins/:userId", async (request, reply) => {
    if (!request.user) return;
    const { networkId, userId } = request.params as {
      networkId: string;
      userId: string;
    };

    const parsed = UpdateNetworkAdminRoleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      await updateNetworkAdminRole(
        networkId,
        userId,
        parsed.data.role,
        request.user.userId,
      );
      return reply.status(200).send({ data: { userId, role: parsed.data.role } });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] updateNetworkAdminRole error");
    }
  });

  // GET /users
  fastify.get("/users", async (request, reply) => {
    const parsed = GlobalUserSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const result = await globalUserSearch(
        parsed.data.q,
        parsed.data.limit,
        parsed.data.cursor,
      );
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] globalUserSearch error");
    }
  });

  // PATCH /users/:userId/disable
  fastify.patch("/users/:userId/disable", async (request, reply) => {
    if (!request.user) return;
    const { userId } = request.params as { userId: string };

    const parsed = DisableUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      await disableUser(userId, parsed.data.reason, request.user.userId);
      return reply.status(200).send({ data: { userId, disabled: true } });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] disableUser error");
    }
  });

  // GET /metrics
  fastify.get("/metrics", async (request, reply) => {
    try {
      const data = await getPlatformMetrics();
      return reply.status(200).send({ data });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] getPlatformMetrics error");
    }
  });

  // POST /broadcast
  fastify.post("/broadcast", async (request, reply) => {
    if (!request.user) return;

    const parsed = SuperAdminBroadcastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const { superAdminBroadcast } = await import("../../tasks/announcement.tasks.js");
      await superAdminBroadcast.trigger({
        networkIds: parsed.data.networkIds,
        groupIds: parsed.data.groupIds,
        type: parsed.data.type,
        title: parsed.data.title,
        body: parsed.data.body,
        senderUserId: request.user.userId,
      });

      return reply.status(202).send({ data: { status: "ACCEPTED", message: "Broadcast initiated" } });
    } catch (err: unknown) {
      return handleError(err, reply, "[Super Admin] broadcast error");
    }
  });
};

type ServiceError = Error & { code?: string; statusCode?: number };

async function handleError(
  err: unknown,
  reply: import("fastify").FastifyReply,
  logMessage: string,
): Promise<void> {
  const error = err as ServiceError;
  const status = error.statusCode ?? 500;
  const code = error.code ?? "INTERNAL_ERROR";
  const message =
    status < 500 ? error.message : "An internal server error occurred";

  if (status >= 500) {
    logger.error({ err: error }, logMessage);
  }

  await reply.status(status).send({ error: message, code });
}
