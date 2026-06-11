/**
 * src/modules/admin/announcements/schemas.ts
 */

import { z } from "zod";

export const CreateAnnouncementSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  body: z.string().min(10, "Body must be at least 10 characters"),
  networkId: z.string().uuid("Invalid network ID"),
  groupId: z.string().uuid("Invalid group ID").optional(),
});

export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementSchema>;

export const CreateNewsletterSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  body: z.string().min(10, "Body must be at least 10 characters"),
  networkId: z.string().uuid("Invalid network ID"),
  groupId: z.string().uuid("Invalid group ID").optional(),
});

export type CreateNewsletterInput = z.infer<typeof CreateNewsletterSchema>;
