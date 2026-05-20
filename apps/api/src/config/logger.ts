/**
 * src/config/logger.ts
 *
 * Pino logger singleton.
 * - Development: human-readable pretty output via pino's built-in transport
 * - Production: structured JSON to stdout (ingested by log aggregators)
 */

import pino from "pino";
import { env } from "./env.js";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
