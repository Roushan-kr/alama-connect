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

// Route plugins
import { authRouter } from "./modules/auth/router.js"
import { verificationRouter } from "./modules/verification/router.js"
import { usersRouter } from "./modules/users/router.js"

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
      files: 1, // max 1 file per request in Phase 1
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
      timestamp: new Date().toISOString(),
    })
  })

  // ── Route Modules ─────────────────────────────────────────────────────────

  await app.register(authRouter, { prefix: "/api/auth" })
  await app.register(verificationRouter, { prefix: "/api/verification" })
  await app.register(usersRouter, { prefix: "/api/users" })

  // Phase 2+ routers will be registered here.

  return app
}
