import { z } from "zod";

export const UpdateNetworkAdminRoleSchema = z.object({
  role: z.enum(["ADMIN", "FACULTY", "ALUMNI", "STUDENT"]),
});

export const GlobalUserSearchSchema = z.object({
  q: z.string().default(""),
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const DisableUserSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
});

export const SuperAdminBroadcastSchema = z.object({
  networkIds: z.array(z.string().uuid()).default([]),
  groupIds: z.array(z.string().uuid()).default([]),
  type: z.enum(["ANNOUNCEMENT", "NEWSLETTER"]),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  body: z.string().min(10, "Body must be at least 10 characters"),
});

export type SuperAdminBroadcastInput = z.infer<typeof SuperAdminBroadcastSchema>;
