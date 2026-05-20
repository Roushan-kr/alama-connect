/**
 * src/config/redis.ts
 *
 * ioredis client singleton configured for Upstash Redis (TCP/TLS).
 * The REDIS_URL format for Upstash TCP is:
 *   rediss://:<password>@<host>:<port>
 *
 * Also exports:
 *   - `redisPublish(channel, payload)` — publish JSON event to a Redis channel
 *   - `createSubscriber()` — create a dedicated subscriber client (needed for pub/sub)
 */

import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";


function createRedisClient(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    // Upstash closes idle connections — auto-reconnect.
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      logger.warn({ attempt: times, delayMs: delay }, `[Redis:${name}] reconnecting`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () =>
    logger.info(`[Redis:${name}] connected`),
  );
  client.on("error", (err: Error) =>
    logger.error({ err }, `[Redis:${name}] error`),
  );
  client.on("close", () =>
    logger.warn(`[Redis:${name}] connection closed`),
  );

  return client;
}

/** Main Redis client for get/set/del/zadd operations. */
export const redis = createRedisClient("main");

/**
 * Publish a JSON payload to a Redis pub/sub channel.
 * Used for real-time notifications and Socket.IO cross-instance messaging.
 */
export async function redisPublish(
  channel: string,
  payload: unknown,
): Promise<void> {
  await redis.publish(channel, JSON.stringify(payload));
}

/**
 * Create a dedicated subscriber client.
 * ioredis clients in subscribe mode cannot be used for regular commands,
 * so callers must create a separate instance.
 */
export function createSubscriber(): Redis {
  return createRedisClient("subscriber");
}
