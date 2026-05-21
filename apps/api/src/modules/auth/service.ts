/**
 * src/modules/auth/service.ts
 *
 * Auth business logic.
 * All DB calls and token operations live here — routers are thin.
 *
 * Token strategy:
 *   Access token:  HS256 JWT, 15m, in Authorization header
 *   Refresh token: HS256 JWT, 30d, in httpOnly cookie
 *   Refresh tokens are hashed (SHA-256) and stored in the sessions table
 *   so they can be individually revoked on logout or rotation.
 */

import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { nowDate, nowTimestamp } from "@alumni/shared";
import { sendConfirmationEmail } from "../../tasks/email.tasks.js";
import type { RegisterInput, LoginInput } from "./schemas.js";
import type { AuthTokens, PublicUser } from "./types.js";

// ── Secrets ───────────────────────────────────────────────────────────────────

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// ── Argon2id config ───────────────────────────────────────────────────────────

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function signAccessToken(
  userId: string,
  email: string,
  username: string,
  globalRole: string,
): Promise<string> {
  return new SignJWT({ email, username, globalRole })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret);
}

async function signRefreshToken(
  userId: string,
  sessionId: string,
): Promise<string> {
  return new SignJWT({ purpose: "refresh", sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(refreshSecret);
}

function toPublicUser(user: {
  userId: string;
  email: string;
  username: string;
  globalRole: string;
  emailVerified: boolean;
  createdAt: Date;
}): PublicUser {
  return {
    userId: user.userId,
    email: user.email,
    username: user.username,
    globalRole: user.globalRole,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Register a new user.
 * Creates user + profile rows, fires confirmation email task (fire-and-forget).
 *
 * @throws if email or username is already taken
 */
export async function register(input: RegisterInput): Promise<PublicUser> {
  // Check for existing email.
  const existing = await db.user.findFirst({
    where: {
      OR: [
        { email: input.email },
        { username: input.username },
      ],
    },
    select: { email: true, username: true },
  });

  if (existing) {
    if (existing.email === input.email) {
      throw Object.assign(new Error("Email already registered"), {
        code: "EMAIL_TAKEN",
        status: 409,
      });
    }
    throw Object.assign(new Error("Username already taken"), {
      code: "USERNAME_TAKEN",
      status: 409,
    });
  }

  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash,
        emailVerified: false,
        globalRole: "USER",
      },
    });

    await tx.profile.create({
      data: {
        userId: created.userId,
        fullName: input.fullName ?? null,
      },
    });

    await tx.userSettings.create({
      data: { userId: created.userId },
    });

    return created;
  });

  logger.info({ userId: user.userId, email: user.email }, "[Auth] user registered");

  // Fire-and-forget: Trigger.dev sends the confirmation email.
  await sendConfirmationEmail.trigger({
    userId: user.userId,
    email: user.email,
    username: user.username,
  });

  return toPublicUser(user);
}

/**
 * Confirm a user's email address using the signed token from the confirmation link.
 *
 * @param token - JWT from the ?token= query param
 * @throws if token is invalid, expired, or already used
 */
export async function confirmEmail(token: string): Promise<void> {
  const emailSecret = new TextEncoder().encode(env.EMAIL_SECRET);

  let payload: { sub?: string; purpose?: unknown };
  try {
    const result = await jwtVerify(token, emailSecret);
    payload = result.payload as typeof payload;
  } catch {
    throw Object.assign(new Error("Invalid or expired confirmation token"), {
      code: "INVALID_TOKEN",
      status: 400,
    });
  }

  if (payload.purpose !== "email-confirm" || !payload.sub) {
    throw Object.assign(new Error("Invalid confirmation token purpose"), {
      code: "INVALID_TOKEN",
      status: 400,
    });
  }

  await db.user.update({
    where: { userId: payload.sub },
    data: { emailVerified: true },
  });

  logger.info({ userId: payload.sub }, "[Auth] email confirmed");
}

/**
 * Authenticate a user with email + password.
 * Returns access + refresh tokens and a session row.
 *
 * @throws on invalid credentials or unverified email
 */
export async function login(
  input: LoginInput,
): Promise<{ tokens: AuthTokens; refreshToken: string; user: PublicUser }> {
  const user = await db.user.findUnique({
    where: { email: input.email },
  });

  if (!user) {
    // Constant-time response to prevent user enumeration.
    await argon2.verify(
      "$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder",
      input.password,
    ).catch(() => null);
    throw Object.assign(new Error("Invalid email or password"), {
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  }

  const validPassword = await argon2.verify(user.passwordHash, input.password);
  if (!validPassword) {
    throw Object.assign(new Error("Invalid email or password"), {
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  }

  if (!user.emailVerified) {
    throw Object.assign(new Error("Please confirm your email address before logging in"), {
      code: "EMAIL_NOT_VERIFIED",
      status: 403,
    });
  }

  // Create session + sign tokens.
  const sessionId = randomBytes(16).toString("hex");
  const refreshToken = await signRefreshToken(user.userId, sessionId);
  const tokenHash = sha256(refreshToken);
  const expiresAt = new Date(nowTimestamp() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.session.create({
    data: {
      sessionId,
      userId: user.userId,
      tokenHash,
      expiresAt,
    },
  });

  const accessToken = await signAccessToken(
    user.userId,
    user.email,
    user.username,
    user.globalRole,
  );

  const accessExpiresAt = new Date(nowTimestamp() + 15 * 60 * 1000);

  logger.info({ userId: user.userId }, "[Auth] user logged in");

  return {
    tokens: { accessToken, expiresAt: accessExpiresAt.toISOString() },
    refreshToken,
    user: toPublicUser(user),
  };
}

/**
 * Rotate refresh token — invalidate old session, issue new tokens.
 *
 * @param refreshToken - The current refresh token from the httpOnly cookie
 * @throws if token is invalid, expired, or session not found
 */
export async function refresh(
  refreshToken: string,
): Promise<{ tokens: AuthTokens; newRefreshToken: string }> {
  let payload: { sub?: string; sessionId?: unknown };

  try {
    const result = await jwtVerify(refreshToken, refreshSecret);
    payload = result.payload as typeof payload;
  } catch {
    throw Object.assign(new Error("Invalid or expired refresh token"), {
      code: "INVALID_TOKEN",
      status: 401,
    });
  }

  if (!payload.sub || typeof payload.sessionId !== "string") {
    throw Object.assign(new Error("Malformed refresh token"), {
      code: "INVALID_TOKEN",
      status: 401,
    });
  }

  const tokenHash = sha256(refreshToken);
  const session = await db.session.findFirst({
    where: {
      sessionId: payload.sessionId,
      userId: payload.sub,
      tokenHash,
      expiresAt: { gt: new Date() },
    },
    include: { user: { select: { email: true, username: true, globalRole: true } } },
  });

  if (!session) {
    throw Object.assign(new Error("Session not found or expired. Please log in again."), {
      code: "SESSION_EXPIRED",
      status: 401,
    });
  }

  // Rotate: delete old session, create new one.
  const newSessionId = randomBytes(16).toString("hex");
  const newRefreshToken = await signRefreshToken(payload.sub, newSessionId);
  const newTokenHash = sha256(newRefreshToken);
  const newExpiresAt = new Date(nowTimestamp() + 30 * 24 * 60 * 60 * 1000);

  await db.$transaction([
    db.session.delete({ where: { sessionId: payload.sessionId } }),
    db.session.create({
      data: {
        sessionId: newSessionId,
        userId: payload.sub,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  const accessToken = await signAccessToken(
    payload.sub,
    session.user.email,
    session.user.username,
    session.user.globalRole,
  );

  const accessExpiresAt = new Date(nowTimestamp() + 15 * 60 * 1000);

  return {
    tokens: { accessToken, expiresAt: accessExpiresAt.toISOString() },
    newRefreshToken,
  };
}

/**
 * Invalidate a session (logout).
 *
 * @param refreshToken - The refresh token from the httpOnly cookie
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    const { payload } = await jwtVerify(refreshToken, refreshSecret);
    const sessionId = (payload as Record<string, unknown>)["sessionId"] as string | undefined;

    if (sessionId) {
      await db.session.deleteMany({
        where: { sessionId, userId: payload.sub as string },
      });
    }
  } catch {
    // Token already invalid — nothing to invalidate. Treat as success.
  }

  logger.debug("[Auth] session invalidated (logout)");
}
