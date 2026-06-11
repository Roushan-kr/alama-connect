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
