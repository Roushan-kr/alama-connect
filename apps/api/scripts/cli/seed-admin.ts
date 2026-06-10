#!/usr/bin/env tsx
/**
 * CLI script: seed-admin.ts
 * Create the initial admin user for a network.
 * Generates a random 12-char temp password, hashes with Argon2id,
 * and prints it to stdout (no email in dev; add Nodemailer call in prod).
 *
 * Usage:
 *   npx tsx scripts/cli/seed-admin.ts \
 *     --network-code "PTU" \
 *     --email "tpo@ptu.ac.in" \
 *     --name "Dr. Sharma"
 */

import "dotenv/config"
import { db } from "../../src/config/db.js"
import argon2 from "argon2"
import { parseArgs } from "node:util"
import { randomBytes } from "node:crypto"

/** Generate a cryptographically random printable password. */
function generateTempPassword(length = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
  const bytes = randomBytes(length)
  return Array.from(bytes)
    .map((b) => charset[b % charset.length])
    .join("")
}

async function main() {
  const { values } = parseArgs({
    options: {
      "network-code": { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
    },
    strict: true,
  })

  const networkCode = values["network-code"]

  // ── Validate required args ──────────────────────────────────────────────────
  if (!networkCode || !values.email || !values.name) {
    console.error("❌  --network-code, --email, and --name are required.")
    process.exit(1)
  }

  // ── Resolve network ─────────────────────────────────────────────────────────
  const network = await db.network.findUnique({
    where: { code: networkCode.toUpperCase() },
  })
  if (!network) {
    console.error(
      `❌  Network with code "${networkCode.toUpperCase()}" not found. Run seed-network.ts first.`,
    )
    process.exit(1)
  }

  // ── Check for duplicate email ───────────────────────────────────────────────
  const existingUser = await db.user.findUnique({
    where: { email: values.email.toLowerCase() },
  })
  if (existingUser) {
    console.error(`❌  A user with email "${values.email}" already exists.`)
    process.exit(1)
  }

  // ── Hash temp password ──────────────────────────────────────────────────────
  const tempPassword = generateTempPassword()
  const passwordHash = await argon2.hash(tempPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  })

  // ── Create user, profile, and network membership in a transaction ───────────
  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: values.email?.split("@")[0] ?? "",
        email: values.email!.toLowerCase(),
        passwordHash,
        emailVerified: true,
        globalRole: "USER",
      },
    })

    await tx.profile.create({
      data: {
        userId: user.userId,
        fullName: values.name ?? null,
      },
    })

    const membership = await tx.networkMember.create({
      data: {
        userId: user.userId,
        networkId: network.networkId,
        role: "ADMIN",
        status: "VERIFIED",
      },
    })

    await tx.userSettings.create({
      data: { userId: user.userId },
    })

    return { user, membership }
  })

  // ── Print confirmation ──────────────────────────────────────────────────────
  console.log("\n✅  Admin user created successfully:")
  console.log(`   user_id        : ${result.user.userId}`)
  console.log(`   email          : ${result.user.email}`)
  console.log(`   full_name      : ${values.name}`)
  console.log(`   network        : ${network.name} (${network.code})`)
  console.log(`   role           : ADMIN`)
  console.log(`   status         : VERIFIED`)
  console.log("\n⚠️   TEMPORARY PASSWORD (share securely, forces change on first login):")
  console.log(`   ${tempPassword}`)
  console.log(
    "\n   NOTE: In production, call emailService.sendAdminWelcome() here instead of printing.",
  )
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
