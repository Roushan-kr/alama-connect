/**
 * src/modules/messaging/schemas.ts
 */

import { z } from "zod";

export const CreateConversationSchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID"),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;

export const SendMessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty").max(2000, "Message cannot exceed 2000 characters"),
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const ListMessagesSchema = z.object({
  cursor: z.string().datetime().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListMessagesQuery = z.infer<typeof ListMessagesSchema>;
