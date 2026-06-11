/**
 * src/modules/verification/schemas.ts
 *
 * Zod validation schemas for the verification module.
 */

import { z } from "zod";

/** Multipart form data for submitting a verification request. */
export const SubmitVerificationSchema = z.object({
  networkId: z.uuid("networkId must be a valid UUID"),
  method: z.enum(["ENTRY_NUMBER", "DOCUMENT_UPLOAD"]),
  /** Required when method = ENTRY_NUMBER. */
  entryNumber: z.string().min(1).max(50).optional(),
  /** Provided by the multipart parser, not this schema — handled separately. */
});
export type SubmitVerificationInput = z.infer<typeof SubmitVerificationSchema>;

/** Admin approve/reject body. */
export const ReviewVerificationSchema = z.object({
  notes: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
});
export type ReviewVerificationInput = z.infer<typeof ReviewVerificationSchema>;

/** Pagination query for the admin queue. */
export const VerificationListSchema = z.object({
  networkId: z.uuid(),
  status: z.enum(["PENDING", "UNDER_REVIEW", "DECIDED"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type VerificationListInput = z.infer<typeof VerificationListSchema>;
