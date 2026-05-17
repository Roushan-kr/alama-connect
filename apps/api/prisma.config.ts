/**
 * prisma.config.ts — Prisma 7 CLI configuration
 *
 * Prisma 7 does NOT auto-load .env files.
 * dotenv/config MUST be the very first import so DATABASE_URL is available
 * before defineConfig runs.
 *
 * Place this file at apps/api/ (the package root from which you run prisma
 * CLI commands in this monorepo).
 *
 * CLI usage:
 *   pnpm --filter @alumni/api db:migrate   → prisma migrate dev
 *   pnpm --filter @alumni/api db:generate  → prisma generate
 *   pnpm --filter @alumni/api db:studio    → prisma studio
 *
 * If running prisma directly from the repo root, pass --config explicitly:
 *   npx prisma migrate dev --config apps/api/prisma.config.ts
 */

import "dotenv/config"; // load .env before anything else
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  /**
   * Absolute path to schema.prisma.
   * __dirname resolves to apps/api/ at runtime.
   */
  schema: path.join(__dirname, "prisma", "schema.prisma"),

  /**
   * Absolute path to the migrations directory.
   */
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },

  /**
   * Datasource override — keeps the DATABASE_URL connection string
   * out of schema.prisma and centralised here where dotenv is loaded.
   * This value takes precedence over the env() call in schema.prisma.
   */
  datasource: {
    url: process.env["DATABASE_URL"] as string,
  },
});
