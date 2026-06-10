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

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

/** Create a work experience entry. */
export const CreateExperienceSchema = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  startDate: dateString,
  endDate: dateString.optional(),
  description: z.string().max(2000).optional(),
});
export type CreateExperienceInput = z.infer<typeof CreateExperienceSchema>;

/** Update a work experience entry (at least one field). */
export const UpdateExperienceSchema = CreateExperienceSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field must be provided" },
);
export type UpdateExperienceInput = z.infer<typeof UpdateExperienceSchema>;

export const ExperienceIdParamsSchema = z.object({
  expId: z.uuid(),
});
export type ExperienceIdParams = z.infer<typeof ExperienceIdParamsSchema>;

/** Add a skill by name (catalogue is normalised on write). */
export const AddSkillSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});
export type AddSkillInput = z.infer<typeof AddSkillSchema>;

export const SkillIdParamsSchema = z.object({
  skillId: z.coerce.number().int().positive(),
});
export type SkillIdParams = z.infer<typeof SkillIdParamsSchema>;
