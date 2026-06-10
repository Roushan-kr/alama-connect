/**
 * src/modules/search/schemas.ts
 */

import { z } from "zod";

export const SearchSchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
  networkId: z.string().uuid("Invalid network ID"),
  type: z.enum(["users", "content", "posts", "jobs", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime({ message: "Invalid cursor date format" }).optional(),
});

export type SearchQueryInput = z.infer<typeof SearchSchema>;
