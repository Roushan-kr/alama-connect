#!/usr/bin/env tsx
/**
 * CLI script: seed-network.ts
 * Bootstrap a new university network (no UI equivalent — CLI only by design).
 *
 * Usage:
 *   npx tsx scripts/cli/seed-network.ts \
 *     --name "Punjab Technical University" \
 *     --code "PTU" \
 *     --domains "ptu.ac.in,lpu.in" \
 *     --logo "https://cdn.example.com/logos/ptu.png"
 */

import "dotenv/config";
import { db } from "../../src/config/db.js";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      code: { type: "string" },
      domains: { type: "string" }, // comma-separated
      logo: { type: "string" },
    },
    strict: true,
  });

  // ── Validate required args ──────────────────────────────────────────────────
  if (!values.name || !values.code) {
    console.error("❌  --name and --code are required.");
    process.exit(1);
  }

  const allowedDomains = values.domains
    ? values.domains.split(",").map((d) => d.trim().toLowerCase())
    : [];

  // ── Check for duplicate code ────────────────────────────────────────────────
  const existing = await db.network.findUnique({
    where: { code: values.code.toUpperCase() },
  });
  if (existing) {
    console.error(
      `❌  Network with code "${values.code.toUpperCase()}" already exists (id: ${existing.networkId}).`
    );
    process.exit(1);
  }

  // ── Insert network ──────────────────────────────────────────────────────────
  const network = await db.network.create({
    data: {
      name: values.name,
      code: values.code.toUpperCase(),
      allowedDomains,
      logoUrl: values.logo ?? null,
    },
  });

  console.log("✅  Network created successfully:");
  console.log(`   network_id : ${network.networkId}`);
  console.log(`   name       : ${network.name}`);
  console.log(`   code       : ${network.code}`);
  console.log(`   domains    : ${network.allowedDomains.join(", ") || "(none)"}`);
  console.log(`   logo       : ${network.logoUrl ?? "(none)"}`);
  console.log("\nSave the network_id — you'll need it for seed-admin.ts.");
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
