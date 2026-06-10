/**
 * src/modules/connections/schemas.ts
 */

import { z } from "zod";

export const SendConnectionRequestSchema = z.object({
  toUserId: z.string().uuid("Invalid user ID format"),
});

export type SendConnectionRequestInput = z.infer<typeof SendConnectionRequestSchema>;

export const RespondConnectionRequestSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export type RespondConnectionRequestInput = z.infer<typeof RespondConnectionRequestSchema>;

export const ListConnectionsSchema = z.object({
  cursor: z.string().datetime({ message: "Invalid cursor date format" }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListConnectionsQuery = z.infer<typeof ListConnectionsSchema>;
