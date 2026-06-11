/**
 * src/config/env.ts
 *
 * Validates all required environment variables at startup using Zod.
 * The app will crash fast with a clear error message if any required
 * variable is missing or malformed — preventing silent misconfigurations.
 *
 * Import this module FIRST in src/index.ts before any other config.
 */

import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  // ── Runtime ──────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  API_URL: z.url().default("http://localhost:3001"),

  // ── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // ── JWT Secrets (min 32 chars for security) ───────────────────────────────
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  /** Short-lived secret used to sign email confirmation tokens. */
  EMAIL_SECRET: z
    .string()
    .min(32, "EMAIL_SECRET must be at least 32 characters"),

  // ── Redis (Upstash TCP or local) ──────────────────────────────────────────
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required (e.g. rediss://:<password>@host:port)"),

  // ── Cloudflare R2 (S3-compatible) ────────────────────────────────────────
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required").optional(),
  R2_ACCESS_KEY_ID: z
    .string()
    .min(1, "R2_ACCESS_KEY_ID is required")
    .optional(),
  R2_SECRET_ACCESS_KEY: z
    .string()
    .min(1, "R2_SECRET_ACCESS_KEY is required")
    .optional(),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required").optional(),
  /** Public CDN URL prefix for serving signed assets (no trailing slash). */
  R2_PUBLIC_URL: z.url().optional(),

  // ── Email (SMTP via Nodemailer) ───────────────────────────────────────────
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Alumni Platform <noreply@alumni.dev>"),

  // ── Trigger.dev ───────────────────────────────────────────────────────────
  TRIGGER_SECRET_KEY: z.string().min(1, "TRIGGER_SECRET_KEY is required"),

  // ── Frontend URL (for email deep-links) ──────────────────────────────────
  WEB_URL: z.url().default("http://localhost:3000"),

  // ── CORS ─────────────────────────────────────────────────────────────────
  /** Comma-separated list of allowed origins, e.g. "http://localhost:3000,https://app.alumni.dev" */
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

/** Parsed, type-safe environment variables. */
export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌  Invalid environment variables:\n");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    console.error(
      "\nFix the above variables in your .env file and restart the server.\n",
    );
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
