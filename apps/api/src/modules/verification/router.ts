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
import { requireAuth } from "@/middleware/requireAuth.js";
import { logger } from "@/config/logger.js";
import { db } from "@/config/db.js";
import { assertNetworkAdmin } from "@/middleware/requireRole.js";
import { getSignedUrl } from "@/services/storage/index.js";


export const verificationRouter: FastifyPluginAsync = async (fastify) => {
  // ── POST /api/verification/upload ───────────────────────────────────────────
  fastify.post("/upload", async (request, reply) => {
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          fileBuffer = await part.toBuffer();
          filename = part.filename;
          mimeType = part.mimetype;
        }
      }
    } catch (err) {
      logger.warn({ err }, "[Verification] upload parse error");
      return reply.status(400).send({
        error: "Invalid file upload data",
        code: "VALIDATION_ERROR",
      });
    }

    if (!fileBuffer || !filename) {
      return reply.status(400).send({
        error: "No file uploaded",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const { scanBuffer } = await import("@/services/storage/virusScan.js");
      const scanResult = await scanBuffer(fileBuffer);
      if (!scanResult.clean) {
        return reply.status(400).send({
          error: `Malicious file detected: ${scanResult.threat ?? "unknown"}`,
          code: "VIRUS_DETECTED",
        });
      }

      const { uploadFile, buildKey } = await import("@/services/storage/index.js");
      const safeKey = buildKey("verifications", `${Date.now()}-${filename}`);
      await uploadFile(fileBuffer, safeKey, mimeType ?? "application/octet-stream");

      return reply.status(200).send({ data: { documentUrl: safeKey } });
    } catch (err: unknown) {
      logger.error({ err }, "[Verification] upload failed");
      return reply.status(500).send({
        error: "Upload failed",
        code: "INTERNAL_ERROR",
      });
    }
  });

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

      try {
        await assertNetworkAdmin(
          request.user.userId,
          parsed.data.networkId,
          request.user.globalRole,
        );

        const result = await getPendingRequests(
          parsed.data.networkId,
          parsed.data.status,
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
        const reqRow = await db.verificationRequest.findUnique({ where: { reqId } });
        if (!reqRow) {
          return reply.status(404).send({ error: "Verification request not found", code: "NOT_FOUND" });
        }
        await assertNetworkAdmin(request.user.userId, reqRow.networkId, request.user.globalRole);

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
        const reqRow = await db.verificationRequest.findUnique({ where: { reqId } });
        if (!reqRow) {
          return reply.status(404).send({ error: "Verification request not found", code: "NOT_FOUND" });
        }
        await assertNetworkAdmin(request.user.userId, reqRow.networkId, request.user.globalRole);

        await rejectRequest(reqId, request.user.userId, parsed.data?.reason);
        return reply.status(200).send({ data: { reqId, status: "REJECTED" } });
      } catch (err: unknown) {
        return handleError(err, reply);
      }
    },
  );

  // ── GET /api/verification/admin/:reqId/document-url ──────────────────────────
  fastify.get(
    "/admin/:reqId/document-url",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      if (!request.user) return;
      const { reqId } = request.params as { reqId: string };

      try {
        const req = await db.verificationRequest.findUnique({
          where: { reqId },
        });

        if (!req) {
          return reply.status(404).send({
            error: "Verification request not found",
            code: "NOT_FOUND",
          });
        }

        if (!req.documentUrl) {
          return reply.status(400).send({
            error: "No document attached to this request",
            code: "VALIDATION_ERROR",
          });
        }

        await assertNetworkAdmin(
          request.user.userId,
          req.networkId,
          request.user.globalRole,
        );

        const url = await getSignedUrl(req.documentUrl, 900);
        return reply.status(200).send({ data: { url } });
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
