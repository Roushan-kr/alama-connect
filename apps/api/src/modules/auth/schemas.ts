/**
 * src/modules/auth/schemas.ts
 *
 * Zod validation schemas for the auth module.
 * All route handlers use these — never inline validation in routers.
 */

import { z } from "zod";

/** Registration input. */
export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-z0-9_]+$/,
      "Username may only contain lowercase letters, numbers, and underscores",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  fullName: z.string().min(2, "Full name is required").max(100).optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

/** Login input. */
export const LoginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/** Refresh token input (from httpOnly cookie — body is not used). */
export const RefreshSchema = z.object({}).optional();
export type RefreshInput = z.infer<typeof RefreshSchema>;

/** Email confirmation query param. */
export const ConfirmEmailSchema = z.object({
  token: z.string().min(1, "Confirmation token is required"),
});
export type ConfirmEmailInput = z.infer<typeof ConfirmEmailSchema>;
