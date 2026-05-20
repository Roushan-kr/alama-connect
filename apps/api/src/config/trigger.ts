/**
 * src/config/trigger.ts
 *
 * Trigger.dev v4 SDK client singleton.
 * Tasks are defined in src/tasks/ and triggered from API handlers
 * using fire-and-forget: `await triggerClient.sendEvent(...)`.
 *
 * The TRIGGER_SECRET_KEY is loaded from env and validated at startup.
 */

import { configure } from "@trigger.dev/sdk/v3";
import { env } from "./env.js";

// Configure the Trigger.dev SDK globally (v4 style).
// This must be called before any task triggers.
configure({
  secretKey: env.TRIGGER_SECRET_KEY,
});

// Re-export task utilities for convenience.
export { task, schedules, logger as triggerLogger } from "@trigger.dev/sdk/v3";
