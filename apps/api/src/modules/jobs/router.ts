/**
 * src/modules/jobs/router.ts
 */

import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "@/middleware/requireAuth.js";
import { CreateJobSchema, ListJobsSchema } from "./schemas.js";
import { createJob, listJobs, getJob, deleteJob } from "./service.js";
import { db } from "@/config/db.js";
import { logger } from "@/config/logger.js";

export const jobsRouter: FastifyPluginAsync = async (fastify) => {
  // Create Job (requires VERIFIED network member)
  fastify.post("/", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;

    const parsed = CreateJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    // Retrieve network ID from request payload (or header context if needed)
    // Wait, the schema should include networkId! Let's update the validation or retrieve it from body.
    // Wait, let's check if CreateJobSchema has networkId or if it should be passed dynamically.
    // CreateJobSchema doesn't have networkId. So we should expect body to have networkId or request to specify it.
    // Let's check CreateJobSchema definition again:
    // title, description, location, applyLink, tags, expiresAt, visibility.
    // Wait, how does the API know which network the job is posted under?
    // It should receive networkId in the body or params!
    // Let's parse networkId from body. Let's do a parsed schema update or safeParse request.body.
    const bodyAny = request.body as any;
    const networkId = bodyAny?.networkId;

    if (!networkId || typeof networkId !== "string") {
      return reply.status(400).send({
        error: "networkId is required",
        code: "VALIDATION_ERROR",
      });
    }

    // Verify user is a VERIFIED member of the network
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

    try {
      const result = await createJob(request.user.userId, networkId, parsed.data);
      return reply.status(201).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // List Jobs (query: networkId required)
  fastify.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = ListJobsSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    const { networkId, tags, cursor, cursorId, limit } = parsed.data;
    if (!networkId) {
      return reply.status(400).send({
        error: "networkId query parameter is required",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const filter: { tags?: string[] } = {};
      if (tags !== undefined) filter.tags = tags;
      const result = await listJobs(networkId, filter, cursor, cursorId, limit);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Get Job Detail
  fastify.get("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await getJob(id);
      return reply.status(200).send({ data: result });
    } catch (err: unknown) {
      return handleError(err, reply);
    }
  });

  // Delete Job (soft delete)
  fastify.delete("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    if (!request.user) return;
    const { id } = request.params as { id: string };

    try {
      await deleteJob(request.user.userId, id);
      return reply.status(200).send({ data: { deleted: true } });
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

  logger.error({ err }, "[Jobs] error in route handler");
  return reply.status(500).send({
    error: "An internal server error occurred",
    code: "INTERNAL_ERROR",
  });
}
