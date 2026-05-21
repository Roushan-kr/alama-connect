/**
 * src/modules/users/schemas.ts
 *
 * Zod validation schemas for the users/profile module.
 */

import { z } from "zod";

/** Fields the user can update on their own profile. */
export const UpdateProfileSchema = z
  .object({
    fullName: z.string().min(2).max(100).optional(),
    headline: z.string().max(160).optional(),
    bio: z.string().max(2000).optional(),
    country: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    locality: z.string().max(100).optional(),
    linkedinUrl: z
      .url("Invalid LinkedIn URL")
      .max(300)
      .optional()
      .or(z.literal("")),
    publicEmail: z
      .email("Invalid email")
      .optional()
      .or(z.literal("")),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

/** Query params for public user profile lookup. */
export const GetUserSchema = z.object({
  userId: z.uuid(),
});
export type GetUserParams = z.infer<typeof GetUserSchema>;
