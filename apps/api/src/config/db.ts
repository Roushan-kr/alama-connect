/**
 * src/config/db.ts
 *
 * Prisma client singleton.
 * A single PrismaClient instance is shared across the entire process to
 * avoid exhausting the PostgreSQL connection pool.
 *
 * In development, the global object is used to survive hot-reloads via
 * tsx watch without opening new connections on every file change.
 */

import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import { logger } from "./logger.js";

// Extend the global type to hold our cached Prisma instance in dev.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { level: "query", emit: "event" },
            { level: "warn", emit: "stdout" },
            { level: "error", emit: "stdout" },
          ]
        : [
            { level: "warn", emit: "stdout" },
            { level: "error", emit: "stdout" },
          ],
  });

  // Log slow queries in development for performance awareness.
  if (env.NODE_ENV === "development") {
    type PrismaQueryEvent = { query: string; duration: number };
    (client.$on as (event: "query", cb: (e: PrismaQueryEvent) => void) => void)(
      "query",
      (e: PrismaQueryEvent) => {
        if (e.duration > 100) {
          logger.warn(
            { query: e.query, durationMs: e.duration },
            "Slow Prisma query",
          );
        }
      },
    );
  }

  return client;
}

export const db: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
