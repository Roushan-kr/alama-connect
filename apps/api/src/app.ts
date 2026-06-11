/**
 * src/app.ts
 *
 * Fastify application factory.
 * Builds and configures the Fastify instance without starting the HTTP server.
 * Separated from src/index.ts for testability.
 */

import Fastify, { type FastifyInstance } from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import { env } from "./config/env.js"
import { logger } from "./config/logger.js"
import { db } from "./config/db.js"

// Route plugins
import { authRouter } from "./modules/auth/router.js"
import { verificationRouter } from "./modules/verification/router.js"
import { usersRouter } from "./modules/users/router.js"
import { feedRouter } from "./modules/feed/router.js"
import { postsRouter, commentsRouter } from "./modules/posts/router.js"
import { followRouter } from "./modules/follow/router.js"
import { notificationsRouter } from "./modules/notifications/router.js"
import { jobsRouter } from "./modules/jobs/router.js"
import { groupsRouter } from "./modules/groups/router.js"
import { messagingRouter } from "./modules/messaging/router.js"
import { connectionsRouter } from "./modules/connections/router.js"
import { searchRouter } from "./modules/search/router.js"
import { presenceRouter } from "./modules/presence/router.js"
import { adminRouter } from "./modules/admin/router.js"
import { rosterRouter } from "./modules/roster/router.js"
import { superAdminRouter } from "./modules/superAdmin/router.js"
import { memberManagementRouter } from "./modules/admin/memberManagement.router.js"
import { nowISO } from "@alumni/shared"


/**
 * Build and configure the Fastify app.
 * @returns A fully configured FastifyInstance (not yet listening)
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // We use Pino directly via src/config/logger.ts
    trustProxy: true, // Needed for rate limiting behind a reverse proxy
  })

  // ── Plugins ─────────────────────────────────────────────────────────────────

  // Cookie support (for httpOnly refresh token).
  await app.register(cookie, {
    secret: env.JWT_SECRET, // signs cookies for tamper-detection
    hook: "onRequest",
  })

  // CORS — allow only app domains.
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true, // allow cookies cross-origin
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })

  // Multipart form data (for file uploads — max 10MB).
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
      files: 4, // up to 4 images per post (Phase 2)
    },
  })

  // ── Global Error Handler ──────────────────────────────────────────────────

  app.setErrorHandler((err, _request, reply) => {
    const e = err as { statusCode?: number; message?: string }
    const statusCode = e.statusCode
    logger.error({ err }, "[App] unhandled Fastify error")
    return reply.status(statusCode ?? 500).send({
      error:
        statusCode && statusCode < 500 && e.message
          ? e.message
          : "An internal server error occurred",
      code: "INTERNAL_ERROR",
    })
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: "Route not found",
      code: "NOT_FOUND",
    })
  })

  // ── Health Check ──────────────────────────────────────────────────────────

  app.get("/health", async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      uptime: process.uptime(),
      timestamp: nowISO(),
    })
  })

  // ── GET /api/networks ──────────────────────────────────────────────────────

  app.get("/api/networks", async (_request, reply) => {
    try {
      const networks = await db.network.findMany({
        select: {
          networkId: true,
          name: true,
          code: true,
          logoUrl: true,
          allowedDomains: true,
        },
        orderBy: { name: "asc" },
      })
      return reply.status(200).send({ data: networks })
    } catch (err: unknown) {
      logger.error({ err }, "[App] failed to fetch networks")
      return reply.status(500).send({
        error: "Failed to fetch networks",
        code: "INTERNAL_ERROR",
      })
    }
  })

  // ── Route Modules ─────────────────────────────────────────────────────────

  await app.register(authRouter, { prefix: "/api/auth" })
  await app.register(verificationRouter, { prefix: "/api/verification" })
  await app.register(usersRouter, { prefix: "/api/users" })
  await app.register(feedRouter, { prefix: "/api/feed" })
  await app.register(postsRouter, { prefix: "/api/posts" })
  await app.register(commentsRouter, { prefix: "/api/comments" })
  await app.register(followRouter, { prefix: "/api/follow" })
  await app.register(notificationsRouter, { prefix: "/api/notifications" })
  await app.register(jobsRouter, { prefix: "/api/jobs" })
  await app.register(groupsRouter, { prefix: "/api/groups" })
  await app.register(messagingRouter, { prefix: "/api" })
  await app.register(connectionsRouter, { prefix: "/api/connections" })
  await app.register(searchRouter, { prefix: "/api/search" })
  await app.register(presenceRouter, { prefix: "/api/presence" })
  await app.register(adminRouter, { prefix: "/api/admin" })
  await app.register(rosterRouter, { prefix: "/api/admin/roster" })
  await app.register(superAdminRouter, { prefix: "/api/admin/super" })
  await app.register(memberManagementRouter, { prefix: "/api/admin/network/:networkId" })

  return app
}
