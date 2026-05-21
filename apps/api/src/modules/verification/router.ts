/**
 * src/modules/verification/router.ts
 *
 * Fastify route plugin for the verification module.
 *
 * Routes:
 *   POST /api/verification/submit         (authenticated, multipart)
 *   GET  /api/admin/verification/pending  (admin only)
 *   POST /api/admin/verification/:reqId/approve (admin only)
 *   POST /api/admin/verification/:reqId/reject  (admin only)
 */

import type { FastifyPluginAsync } from "fastify";
import {
  SubmitVerificationSchema,
  ReviewVerificationSchema,
  VerificationListSchema,
} from "./schemas.js";
import {
  submitVerification,
  getPendingRequests,
  approveRequest,
  rejectRequest,
} from "./service.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { logger } from "../../config/logger.js";

export const verificationRouter: FastifyPluginAsync = async (fastify) => {
  // ── POST /api/verification/submit ───────────────────────────────────────────
  fastify.post(
    "/submit",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return; // guarded by requireAuth

      let fileBuffer: Buffer | undefined;
      let filename: string | undefined;
      let mimeType: string | undefined;
      let fields: Record<string, string> = {};

      // Parse multipart form data.
      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            fileBuffer = await part.toBuffer();
            filename = part.filename;
            mimeType = part.mimetype;
          } else {
            fields[part.fieldname] = part.value as string;
          }
        }
      } catch (err) {
        logger.warn({ err }, "[Verification] multipart parse error");
        return reply.status(400).send({
          error: "Invalid multipart form data",
          code: "VALIDATION_ERROR",
        });
      }

      const parsed = SubmitVerificationSchema.safeParse(fields);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        });
      }

      try {
        const result = await submitVerification({
          userId: request.user.userId,
          input: parsed.data,
          ...(fileBuffer !== undefined ? { fileBuffer } : {}),
          ...(filename !== undefined ? { filename } : {}),
          ...(mimeType !== undefined ? { mimeType } : {}),
        });
        return reply.status(201).send({ data: result });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    },
  );

  // ── GET /api/admin/verification/pending ─────────────────────────────────────
  fastify.get(
    "/admin/pending",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return;

      const parsed = VerificationListSchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        });
      }

      // TODO: enforce admin role check with requireRole once networkId is from query.
      // For now, the route is auth-gated; service-level admin check via network membership
      // should be added in Phase 2 when requireRole('query', ['ADMIN']) is wired up.

      try {
        const result = await getPendingRequests(
          parsed.data.networkId,
          parsed.data.cursor,
          parsed.data.limit,
        );
        return reply.status(200).send({
          data: result.requests,
          meta: {
            nextCursor: result.nextCursor,
            hasMore: result.nextCursor !== null,
            limit: parsed.data.limit,
          },
        });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    },
  );

  // ── POST /api/admin/verification/:reqId/approve ─────────────────────────────
  fastify.post(
    "/admin/:reqId/approve",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return;

      const { reqId } = request.params as { reqId: string };
      const parsed = ReviewVerificationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        });
      }

      try {
        await approveRequest(reqId, request.user.userId, parsed.data?.notes);
        return reply.status(200).send({ data: { reqId, status: "VERIFIED" } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    },
  );

  // ── POST /api/admin/verification/:reqId/reject ──────────────────────────────
  fastify.post(
    "/admin/:reqId/reject",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return;

      const { reqId } = request.params as { reqId: string };
      const parsed = ReviewVerificationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.issues.map((i) => i.message).join(", "),
          code: "VALIDATION_ERROR",
        });
      }

      try {
        await rejectRequest(reqId, request.user.userId, parsed.data?.reason);
        return reply.status(200).send({ data: { reqId, status: "REJECTED" } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    },
  );
};

// ── Error Handler ─────────────────────────────────────────────────────────────

type ServiceError = Error & { code?: string; status?: number };

async function handleError(
  err: unknown,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  const error = err as ServiceError;
  const status = error.status ?? 500;
  const code = error.code ?? "INTERNAL_ERROR";
  const message =
    status < 500 ? error.message : "An internal server error occurred";

  if (status >= 500) {
    logger.error({ err: error }, "[Verification] unhandled error");
  }

  await reply.status(status).send({ error: message, code });
}
