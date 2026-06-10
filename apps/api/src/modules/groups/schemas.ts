/**
 * src/modules/groups/schemas.ts
 */

import { z } from "zod";

export const CreateGroupSchema = z.object({
  name: z.string().min(3, "Group name must be at least 3 characters").max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(true),
  networkId: z.string().uuid("Invalid network ID"),
});

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = CreateGroupSchema.partial().omit({ networkId: true });

export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

export const InviteMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
});

export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
