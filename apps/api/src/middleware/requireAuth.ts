/**
 * src/middleware/requireAuth.ts
 *
 * Fastify preHandler hook that validates the JWT access token.
 * Attaches a typed `request.user` context object for downstream handlers.
 *
 * Usage in route:
 *   fastify.get('/api/me', { preHandler: [requireAuth] }, handler)
 *
 * Token must be in the Authorization header: `Bearer <token>`
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify } from "jose";
import { env } from "../config/env.js";
import { db } from "../config/db.js";
import { redis } from "../config/redis.js";


/** Shape of the decoded JWT access token payload. */
export interface JwtUser {
  userId: string;
  email: string;
  username: string;
  globalRole: string;
}

// Augmentations are located in src/types/fastify.d.ts


const secret = new TextEncoder().encode(env.JWT_SECRET);

/**
 * Validates the Bearer token and attaches `request.user`.
 * Replies 401 if the token is missing, invalid, or expired.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({
      error: "Missing or malformed Authorization header",
      code: "UNAUTHORIZED",
    });
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, secret);

    if (
      typeof payload.sub !== "string" ||
      typeof payload["email"] !== "string" ||
      typeof payload["username"] !== "string" ||
      typeof payload["globalRole"] !== "string"
    ) {
      throw new Error("Invalid token payload shape");
    }

    request.user = {
      userId: payload.sub,
      email: payload["email"] as string,
      username: payload["username"] as string,
      globalRole: payload["globalRole"] as string,
    };
  } catch (err) {
    return reply.status(401).send({
      error: "Invalid or expired access token",
      code: "UNAUTHORIZED",
    });
  }

  const userId = request.user.userId;
  const redisKey = `user:disabled:${userId}`;

  try {
    const cachedStatus = await redis.get(redisKey);

    if (cachedStatus === "1") {
      return reply.status(403).send({
        error: "Account disabled",
        code: "ACCOUNT_DISABLED",
      });
    }

    if (cachedStatus === null) {
      const settings = await db.userSettings.findUnique({
        where: { userId },
        select: { disabledAt: true },
      });

      if (settings?.disabledAt) {
        await redis.setex(redisKey, 60, "1");
        return reply.status(403).send({
          error: "Account disabled",
          code: "ACCOUNT_DISABLED",
        });
      }
    }
  } catch (err) {
    request.log.error({ err, userId }, "Failed to check disabled status in requireAuth");
    throw err;
  }
}

/**
 * Like requireAuth but also eagerly loads the user's DB record.
 * Use only when the handler genuinely needs the full user object.
 */
export async function requireAuthWithUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (!request.user) return; // already replied 401

  const exists = await db.user.findUnique({
    where: { userId: request.user.userId },
    select: { userId: true },
  });

  if (!exists) {
    return reply.status(401).send({
      error: "User account not found",
      code: "UNAUTHORIZED",
    });
  }
}
