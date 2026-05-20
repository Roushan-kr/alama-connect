/**
 * src/index.ts
 *
 * Entry point — loads env, initialises config singletons, starts the HTTP server.
 *
 * Import order matters:
 *   1. dotenv (must be FIRST so env vars are available before anything else)
 *   2. env validation (crashes fast if vars missing)
 *   3. Everything else (logger, db, redis, trigger, app)
 */

import "dotenv/config"; // loads .env before any other module reads process.env
import { env } from "./config/env.js"; // validates on import — crashes if invalid
import { logger } from "./config/logger.js";
import { db } from "./config/db.js";
import { redis } from "./config/redis.js";

// Trigger.dev SDK must be configured at process startup.
import "./config/trigger.js";

import { buildApp } from "./app.js";

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV, port: env.PORT }, "Starting API server");

  const app = await buildApp();

  // Attempt a DB ping to verify connectivity before accepting traffic.
  try {
    await db.$queryRaw`SELECT 1`;
    logger.info("[DB] connected to PostgreSQL");
  } catch (err) {
    logger.error({ err }, "[DB] failed to connect — is DATABASE_URL correct?");
    process.exit(1);
  }

  // Verify Redis connectivity.
  try {
    await redis.ping();
    logger.info("[Redis] connected");
  } catch (err) {
    logger.error({ err }, "[Redis] failed to connect — is REDIS_URL correct?");
    process.exit(1);
  }

  // Start the HTTP server.
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info({ port: env.PORT }, `🚀  API server running on port ${env.PORT}`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received, closing gracefully...");
  await db.$disconnect();
  await redis.quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ── Unhandled rejections ──────────────────────────────────────────────────────

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — exiting");
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
