/**
 * src/modules/jobs/schemas.ts
 */

import { z } from "zod";
import { ContentVisibility } from "@prisma/client";

export const CreateJobSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  location: z.string().min(2, "Location is required"),
  applyLink: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  tags: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime({ message: "Invalid expiration date format" }).optional(),
  visibility: z.enum(ContentVisibility).default(ContentVisibility.NETWORK),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const ListJobsSchema = z.object({
  cursor: z.iso.datetime().optional(),
  cursorId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tags: z.array(z.string().min(1)).optional(),
  networkId: z.uuid("Invalid network ID").optional(),
});

export type ListJobsQuery = z.infer<typeof ListJobsSchema>;
