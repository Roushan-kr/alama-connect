/**
 * src/services/storage/index.ts
 *
 * Cloudflare R2 storage abstraction using the S3-compatible API.
 * All file operations go through this module — never call S3 client directly
 * from modules or task files.
 *
 * R2 endpoint format: https://<accountId>.r2.cloudflarestorage.com
 *
 * Files are stored with PRIVATE ACL and accessed exclusively via signed URLs
 * (15-minute expiry by default) — never public direct URLs.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

// ── R2 Client ────────────────────────────────────────────────────────────────

function buildR2Client(): S3Client | null {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY
  ) {
    logger.warn(
      "[Storage] R2 credentials not configured — storage operations will throw. Set R2_* env vars.",
    );
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

let r2Client: S3Client | null = buildR2Client();

function getClient(): S3Client {
  if (!r2Client) {
    throw new Error(
      "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env",
    );
  }
  return r2Client;
}

// ── Storage Operations ────────────────────────────────────────────────────────

/**
 * Upload a file buffer to R2.
 *
 * @param buffer - File content as a Node.js Buffer
 * @param key - R2 object key (path), e.g. "documents/userId/filename.pdf"
 * @param contentType - MIME type, e.g. "application/pdf"
 * @returns The R2 key (use this to generate signed URLs later)
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const client = getClient();
  const bucket = env.R2_BUCKET_NAME ?? "alumni-platform";

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // All files are private — access only via signed URLs.
      // R2 does not support ACL headers; private is the default.
    }),
  );

  logger.debug({ key, contentType, sizeBytes: buffer.byteLength }, "[Storage] uploaded");
  return key;
}

/**
 * Generate a presigned GET URL for a private R2 object.
 *
 * @param key - R2 object key
 * @param expiresInSeconds - URL validity window (default 900s = 15 min)
 * @returns Presigned URL string
 */
export async function getSignedUrl(
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  const client = getClient();
  const bucket = env.R2_BUCKET_NAME ?? "alumni-platform";

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await awsGetSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });

  return url;
}

/**
 * Delete an object from R2.
 *
 * @param key - R2 object key to delete
 */
export async function deleteFile(key: string): Promise<void> {
  const client = getClient();
  const bucket = env.R2_BUCKET_NAME ?? "alumni-platform";

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  logger.debug({ key }, "[Storage] deleted");
}

/**
 * Build a canonical R2 key for a given entity type and file.
 * Ensures consistent, safe key naming across the codebase.
 *
 * @example
 * buildKey("documents", userId, "uuid.pdf") → "documents/userId/uuid.pdf"
 */
export function buildKey(...segments: string[]): string {
  // Normalise: replace backslashes, trim slashes, join with forward slash.
  return segments
    .map((s) => s.replace(/\\/g, "/").replace(/^\/|\/$/g, ""))
    .join("/");
}
