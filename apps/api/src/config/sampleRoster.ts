/**
 * src/config/sampleRoster.ts
 *
 * Checks Redis for sample:roster:r2key. If not found, uploads the pre-generated
 * sample roster XLSX to Cloudflare R2 and sets the key in Redis permanently.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { redis } from "./redis.js";
import { uploadFile } from "../services/storage/index.js";
import { logger } from "./logger.js";

export async function ensureSampleRosterUploaded(): Promise<void> {
  try {
    // 1. Check Redis key sample:roster:r2key
    const cachedKey = await redis.get("sample:roster:r2key");
    if (cachedKey) {
      logger.info("[Roster] Sample roster R2 key already cached in Redis");
      return;
    }

    // 2. Read the pre-generated file
    const sampleFilePath = path.join(process.cwd(), "scripts", "sample-roster.xlsx");
    if (!fs.existsSync(sampleFilePath)) {
      logger.warn(`[Roster] Pre-generated sample roster not found at ${sampleFilePath}. Skipping startup upload.`);
      return;
    }

    const buffer = fs.readFileSync(sampleFilePath);

    // 3. Upload to R2 static/sample-roster.xlsx
    const r2Key = "static/sample-roster.xlsx";
    await uploadFile(
      buffer,
      r2Key,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // 4. Cache R2 key in Redis permanently (no TTL)
    await redis.set("sample:roster:r2key", r2Key);
    logger.info(`[Roster] Sample roster uploaded to R2 at key: ${r2Key}`);
  } catch (err) {
    logger.error({ err }, "[Roster] Failed to upload sample roster to R2 on startup");
  }
}
