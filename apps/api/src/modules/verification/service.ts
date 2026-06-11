/**
 * src/modules/verification/service.ts
 *
 * Verification business logic.
 *
 * Pipeline (architecture rule — order MUST be):
 *   1. Validate input
 *   2. Virus scan (BEFORE upload)
 *   3. Upload to R2
 *   4. Create DB row
 *   5. Fire Trigger.dev tasks (fire-and-forget)
 */

import { randomUUID } from "node:crypto";
import { db } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import { scanBuffer } from "../../services/storage/virusScan.js";
import { uploadFile, buildKey } from "../../services/storage/index.js";
import { normalizeEntryNumber } from "../../lib/entry-number.js";
import {
  notifyAdminNewVerification,
  notifyUserVerificationOutcome,
} from "../../tasks/notification.tasks.js";
import { sendWelcomeEmail as _sendWelcomeEmail } from "../../tasks/email.tasks.js";
import type { SubmitVerificationInput } from "./schemas.js";

// ── Submit Verification ───────────────────────────────────────────────────────

export interface SubmitVerificationOptions {
  userId: string;
  input: SubmitVerificationInput;
  fileBuffer?: Buffer;
  filename?: string;
  mimeType?: string;
}

/**
 * Submit a new verification request.
 *
 * Enforces: virus scan → R2 upload → DB insert → notify admins.
 *
 * @throws if method=ENTRY_NUMBER and entryNumber is missing
 * @throws if file is infected
 * @throws if a pending/under_review request already exists for this user+network
 */
export async function submitVerification(
  opts: SubmitVerificationOptions,
): Promise<{ reqId: string }> {
  const { userId, input, fileBuffer, filename, mimeType } = opts;

  // Validate method-specific requirements.
  if (input.method === "ENTRY_NUMBER" && !input.entryNumber) {
    throw Object.assign(
      new Error("Entry number is required for ENTRY_NUMBER method"),
      { code: "VALIDATION_ERROR", status: 400 },
    );
  }

  if (input.method === "DOCUMENT_UPLOAD" && !fileBuffer) {
    throw Object.assign(
      new Error("A document file is required for DOCUMENT_UPLOAD method"),
      { code: "VALIDATION_ERROR", status: 400 },
    );
  }

  // Check for existing active request.
  const existing = await db.verificationRequest.findFirst({
    where: {
      userId,
      networkId: input.networkId,
      status: { in: ["PENDING", "UNDER_REVIEW"] },
    },
  });

  if (existing) {
    throw Object.assign(
      new Error("You already have a pending verification request for this network"),
      { code: "REQUEST_EXISTS", status: 409 },
    );
  }

  let finalEntryNumber: string | null = null;
  let autoAdminNotes: string | null = null;
  let rosterRecord: any = null;
  let autoVerified = false;

  // ── ENTRY_NUMBER validation against roster_records ─────────────────────────
  if (input.method === "ENTRY_NUMBER" && input.entryNumber) {
    const normalized = normalizeEntryNumber(input.entryNumber);
    finalEntryNumber = normalized;

    rosterRecord = await db.rosterRecord.findFirst({
      where: {
        networkId: input.networkId,
        entryNumber: normalized,
        removedFromRoster: false,
      },
    });

    if (!rosterRecord) {
      throw Object.assign(
        new Error("Entry number not found in institutional records"),
        { code: "ENTRY_NUMBER_NOT_FOUND", status: 400 },
      );
    }

    autoAdminNotes = `[auto] Matched roster_record: ${rosterRecord.recordId}`;
    autoVerified = true;
  }

  // ── STEP 1: Virus scan (BEFORE any storage) ───────────────────────────────
  let documentUrl: string | undefined;

  if (fileBuffer && filename) {
    const scan = await scanBuffer(fileBuffer, filename);
    if (!scan.clean) {
      logger.warn(
        { userId, filename, threat: scan.threat },
        "[Verification] infected file rejected",
      );
      throw Object.assign(
        new Error(`File rejected: malware detected (${scan.threat ?? "unknown"})`),
        { code: "FILE_INFECTED", status: 422 },
      );
    }

    // ── STEP 2: Upload to R2 ────────────────────────────────────────────────
    const safeKey = buildKey(
      "verification",
      userId,
      `${randomUUID()}.${filename.split(".").pop() ?? "bin"}`,
    );

    await uploadFile(fileBuffer, safeKey, mimeType ?? "application/octet-stream");
    documentUrl = safeKey;

    logger.debug({ key: safeKey }, "[Verification] document uploaded");
  }

  // ── STEP 3: Create verification request row ────────────────────────────────
  const verReq = await db.verificationRequest.create({
    data: {
      userId,
      networkId: input.networkId,
      method: input.method,
      entryNumber: finalEntryNumber,
      documentUrl: documentUrl ?? null,
      status: autoVerified ? "VERIFIED" : "PENDING",
      adminNotes: autoAdminNotes,
      reviewedAt: autoVerified ? new Date() : null,
    },
  });

  // Ensure network_member row exists (created during onboarding step).
  await db.networkMember.upsert({
    where: { userId_networkId: { userId, networkId: input.networkId } },
    create: { userId, networkId: input.networkId, status: autoVerified ? "VERIFIED" : "PENDING" },
    update: { status: autoVerified ? "VERIFIED" : "PENDING" },
  });

  if (autoVerified && rosterRecord) {
    await db.education.create({
      data: {
        userId,
        networkId: input.networkId,
        degree: rosterRecord.branch,
        endYear: rosterRecord.batch,
        isVerified: true,
      },
    });
  }

  // ── STEP 4: Fire-and-forget Trigger.dev tasks ──────────────────────────────
  const profile = await db.profile.findUnique({
    where: { userId },
    select: { fullName: true },
  });

  if (autoVerified) {
    const userRow = await db.user.findUnique({
      where: { userId },
      select: { email: true, username: true },
    });
    const networkRow = await db.network.findUnique({
      where: { networkId: input.networkId },
      select: { name: true },
    });

    if (userRow && networkRow) {
      await notifyUserVerificationOutcome.trigger({
        userId,
        networkId: input.networkId,
        reqId: verReq.reqId,
        approved: true,
        userEmail: userRow.email,
        userFullName: profile?.fullName ?? userRow.username,
        networkName: networkRow.name,
      });
    }
  } else {
    await notifyAdminNewVerification.trigger({
      reqId: verReq.reqId,
      networkId: input.networkId,
      userId,
      userFullName: profile?.fullName ?? "A user",
    });
  }

  logger.info({ reqId: verReq.reqId, userId }, "[Verification] request submitted");
  return { reqId: verReq.reqId };
}

// ── Admin: Get Pending Queue ──────────────────────────────────────────────────

export interface PendingRequest {
  reqId: string;
  userId: string;
  method: string;
  entryNumber: string | null;
  documentUrl: string | null;
  status: string;
  submittedAt: Date;
  user: { email: string; username: string } | null;
  profile: { fullName: string | null } | null;
}

/**
 * List pending/under-review verification requests for a network.
 * Uses keyset pagination on reqId.
 */
export async function getPendingRequests(
  networkId: string,
  status?: "PENDING" | "UNDER_REVIEW" | "DECIDED",
  cursor?: string,
  limit = 20,
): Promise<{ requests: PendingRequest[]; nextCursor: string | null }> {
  let statusFilter: any = { in: ["PENDING", "UNDER_REVIEW"] };
  if (status === "PENDING") {
    statusFilter = "PENDING";
  } else if (status === "UNDER_REVIEW") {
    statusFilter = "UNDER_REVIEW";
  } else if (status === "DECIDED") {
    statusFilter = { in: ["VERIFIED", "REJECTED"] };
  }

  const requests = await db.verificationRequest.findMany({
    where: {
      networkId,
      status: statusFilter,
      ...(cursor ? { reqId: { lt: cursor } } : {}),
    },
    orderBy: { submittedAt: "asc" },
    take: limit + 1,
    include: {
      user: { select: { email: true, username: true } },
    },
  });

  const hasMore = requests.length > limit;
  const items = hasMore ? requests.slice(0, limit) : requests;
  const nextCursor = hasMore ? (items.at(-1)?.reqId ?? null) : null;

  // Load profiles separately (they're 1:1 so N+1 is acceptable here for admin view).
  const withProfiles: PendingRequest[] = await Promise.all(
    items.map(async (r) => {
      const profile = await db.profile.findUnique({
        where: { userId: r.userId },
        select: { fullName: true },
      });
      return { ...r, profile };
    }),
  );

  return { requests: withProfiles, nextCursor };
}

// ── Admin: Approve ────────────────────────────────────────────────────────────

/**
 * Approve a verification request.
 * Updates: verification_request.status, network_members.status, educations.isVerified.
 * Fires: welcome email task + notification task.
 */
export async function approveRequest(
  reqId: string,
  adminId: string,
  notes?: string,
): Promise<void> {
  const req = await db.verificationRequest.findUnique({
    where: { reqId },
    include: {
      user: { select: { email: true, username: true } },
      network: { select: { name: true } },
    },
  });

  if (!req) {
    throw Object.assign(new Error("Verification request not found"), {
      code: "NOT_FOUND",
      status: 404,
    });
  }

  if (req.status === "VERIFIED" || req.status === "REJECTED") {
    throw Object.assign(
      new Error(`Request has already been ${req.status.toLowerCase()}`),
      { code: "ALREADY_REVIEWED", status: 409 },
    );
  }

  await db.$transaction([
    db.verificationRequest.update({
      where: { reqId },
      data: { status: "VERIFIED", reviewedBy: adminId, reviewedAt: new Date(), adminNotes: notes ?? null },
    }),
    db.networkMember.update({
      where: { userId_networkId: { userId: req.userId, networkId: req.networkId } },
      data: { status: "VERIFIED" },
    }),
    db.education.updateMany({
      where: { userId: req.userId, networkId: req.networkId },
      data: { isVerified: true },
    }),
  ]);

  const profile = await db.profile.findUnique({
    where: { userId: req.userId },
    select: { fullName: true },
  });

  // Fire-and-forget notification + email tasks.
  await notifyUserVerificationOutcome.trigger({
    userId: req.userId,
    networkId: req.networkId,
    reqId,
    approved: true,
    userEmail: req.user.email,
    userFullName: profile?.fullName ?? req.user.username,
    networkName: req.network.name,
  });

  logger.info({ reqId, adminId }, "[Verification] approved");
}

// ── Admin: Reject ─────────────────────────────────────────────────────────────

/**
 * Reject a verification request.
 */
export async function rejectRequest(
  reqId: string,
  adminId: string,
  reason?: string,
): Promise<void> {
  const req = await db.verificationRequest.findUnique({
    where: { reqId },
    include: {
      user: { select: { email: true, username: true } },
      network: { select: { name: true } },
    },
  });

  if (!req) {
    throw Object.assign(new Error("Verification request not found"), {
      code: "NOT_FOUND",
      status: 404,
    });
  }

  if (req.status === "VERIFIED" || req.status === "REJECTED") {
    throw Object.assign(
      new Error(`Request has already been ${req.status.toLowerCase()}`),
      { code: "ALREADY_REVIEWED", status: 409 },
    );
  }

  await db.$transaction([
    db.verificationRequest.update({
      where: { reqId },
      data: {
        status: "REJECTED",
        reviewedBy: adminId,
        reviewedAt: new Date(),
        adminNotes: reason ?? null,
      },
    }),
    db.networkMember.update({
      where: { userId_networkId: { userId: req.userId, networkId: req.networkId } },
      data: { status: "REJECTED" },
    }),
  ]);

  const profile = await db.profile.findUnique({
    where: { userId: req.userId },
    select: { fullName: true },
  });

  await notifyUserVerificationOutcome.trigger({
    userId: req.userId,
    networkId: req.networkId,
    reqId,
    approved: false,
    userEmail: req.user.email,
    userFullName: profile?.fullName ?? req.user.username,
    networkName: req.network.name,
    ...(reason !== undefined ? { reason } : {}),
  });

  logger.info({ reqId, adminId }, "[Verification] rejected");
}
