/**
 * src/services/storage/virusScan.ts
 *
 * Virus scanning abstraction.
 *
 * Development stub: always returns clean.
 * Production: integrate ClamAV REST (via clamav-scanner) or VirusTotal API.
 *
 * CRITICAL RULE: This MUST be called BEFORE uploading any file to R2.
 * Never store a file buffer to permanent storage without a passing scan result.
 */

import { env } from "@/config/env.js";
import { logger } from "@/config/logger.js";

export interface ScanResult {
  clean: boolean;
  /** Threat name if detected, undefined if clean. */
  threat?: string;
}

/**
 * Scans a file buffer for malware before it is stored.
 *
 * @param buffer - Raw file bytes to scan
 * @param filename - Original filename (for logging context)
 * @returns ScanResult indicating whether the file is clean
 */
export async function scanBuffer(
  buffer: Buffer,
  filename = "unknown",
): Promise<ScanResult> {
  if (env.NODE_ENV !== "production") {
    // Dev/test stub — always clean. Log the bypass clearly.
    logger.debug(
      { filename, sizeBytes: buffer.byteLength },
      "[VirusScan] DEV STUB — skipping scan, returning clean",
    );
    return { clean: true };
  }

  // ── Production: integrate your AV provider here ───────────────────────────
  // Option A — ClamAV via REST (clamd HTTP adapter):
  //   import { ClamScan } from 'clamscan';
  //   const scanner = await new ClamScan().init({ ... });
  //   const { isInfected, viruses } = await scanner.scanBuffer(buffer);
  //   if (isInfected) return { clean: false, threat: viruses[0] };
  //   return { clean: true };
  //
  // Option B — VirusTotal API (free tier: 4 req/min):
  //   POST https://www.virustotal.com/api/v3/files
  //   Headers: { x-apikey: process.env.VIRUSTOTAL_API_KEY }
  //   Body: FormData with file
  //   Poll GET /analyses/{id} until status=completed
  //   if (data.stats.malicious > 0) return { clean: false, threat: ... }
  //
  // TODO: implement production AV integration before go-live (Phase 6)
  logger.warn(
    { filename },
    "[VirusScan] Production AV not configured — defaulting to clean. Implement before go-live.",
  );
  return { clean: true };
}
