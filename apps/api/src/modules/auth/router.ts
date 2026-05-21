/**
 * src/modules/auth/router.ts
 *
 * Fastify route plugin for the auth module.
 * All business logic is in service.ts — routes are thin wrappers.
 *
 * Routes:
 *   POST /api/auth/register
 *   GET  /api/auth/confirm
 *   POST /api/auth/login
 *   POST /api/auth/refresh
 *   POST /api/auth/logout
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import {
  RegisterSchema,
  LoginSchema,
  ConfirmEmailSchema,
} from "./schemas.js";
import {
  register,
  confirmEmail,
  login,
  refresh,
  logout,
} from "./service.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

/** httpOnly cookie name for the refresh token. */
const REFRESH_COOKIE = "refresh_token";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/auth",
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

export const authRouter: FastifyPluginAsync = async (fastify) => {
  // ── POST /api/auth/register ─────────────────────────────────────────────────
  fastify.post("/register", async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const user = await register(parsed.data);
      return reply.status(201).send({ data: user });
    } catch (err: unknown) {
      return handleServiceError(err, reply);
    }
  });

  // ── GET /api/auth/confirm ────────────────────────────────────────────────────
  fastify.get("/confirm", async (request, reply) => {
    const parsed = ConfirmEmailSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Missing confirmation token",
        code: "VALIDATION_ERROR",
      });
    }

    try {
      await confirmEmail(parsed.data.token);
      // Redirect to the login page with success message.
      return reply.redirect(`${env.WEB_URL}/login?confirmed=1`);
    } catch (err: unknown) {
      return handleServiceError(err, reply);
    }
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────────────
  fastify.post("/login", async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => i.message).join(", "),
        code: "VALIDATION_ERROR",
      });
    }

    try {
      const { tokens, refreshToken, user } = await login(parsed.data);

      // Set the refresh token in an httpOnly cookie.
      reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);

      return reply.status(200).send({ data: { ...tokens, user } });
    } catch (err: unknown) {
      return handleServiceError(err, reply);
    }
  });

  // ── POST /api/auth/refresh ───────────────────────────────────────────────────
  fastify.post("/refresh", async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];

    if (!refreshToken) {
      return reply.status(401).send({
        error: "No refresh token found. Please log in again.",
        code: "UNAUTHORIZED",
      });
    }

    try {
      const { tokens, newRefreshToken } = await refresh(refreshToken);

      // Rotate the cookie.
      reply.setCookie(REFRESH_COOKIE, newRefreshToken, COOKIE_OPTIONS);

      return reply.status(200).send({ data: tokens });
    } catch (err: unknown) {
      return handleServiceError(err, reply);
    }
  });

  // ── POST /api/auth/logout ────────────────────────────────────────────────────
  fastify.post(
    "/logout",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const refreshToken = request.cookies?.[REFRESH_COOKIE];

      if (refreshToken) {
        await logout(refreshToken);
      }

      // Clear the cookie.
      reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });

      return reply.status(200).send({ data: { message: "Logged out successfully" } });
    },
  );
};

// ── Error Handler ─────────────────────────────────────────────────────────────

type ServiceError = Error & { code?: string; status?: number };

/** Sends a typed error response from a caught service error. */
async function handleServiceError(
  err: unknown,
  reply: import("fastify").FastifyReply,
): Promise<void> {
  const error = err as ServiceError;
  const status = error.status ?? 500;
  const code = error.code ?? "INTERNAL_ERROR";
  const message =
    status < 500 ? error.message : "An internal server error occurred";

  if (status >= 500) {
    logger.error({ err: error }, "[Auth] unhandled service error");
  }

  await reply.status(status).send({ error: message, code });
}
