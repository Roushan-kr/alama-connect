/**
 * @alumni/shared — shared Zod schemas, TypeScript types, and utilities
 * used by both apps/api and apps/web.
 */

import { z } from "zod"

// ─────────────────────────────────────────────────────────────────────────────
// PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

/** Standard pagination metadata returned alongside list responses. */
export interface PaginationMeta {
  nextCursor: string | null
  hasMore: boolean
  limit: number
}

/** A cursor-paginated page of items. */
export interface CursorPage<T> {
  data: T[]
  meta: PaginationMeta
}

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE SHAPES
// ─────────────────────────────────────────────────────────────────────────────

/** Standard success response wrapper. */
export interface ApiSuccess<T> {
  data: T
}

/** Standard success response with pagination. */
export interface ApiPage<T> {
  data: T[]
  meta: PaginationMeta
}

/** Standard error response shape. */
export interface ApiError {
  error: string
  /** Machine-readable error code, e.g. "UNAUTHORIZED", "VALIDATION_ERROR" */
  code: string
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED ZOD HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** UUID string validated by Zod. */
export const ZodUuid = z.string().uuid()

/** Cursor pagination query params shared by all list endpoints. */
export const PaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

// ─────────────────────────────────────────────────────────────────────────────
// SHARED ENUMS (mirroring Prisma enums — source of truth is schema.prisma)
// ─────────────────────────────────────────────────────────────────────────────

export const GlobalRole = {
  USER: "USER",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const
export type GlobalRole = (typeof GlobalRole)[keyof typeof GlobalRole]

export const NetworkRole = {
  STUDENT: "STUDENT",
  ALUMNI: "ALUMNI",
  FACULTY: "FACULTY",
  ADMIN: "ADMIN",
} as const
export type NetworkRole = (typeof NetworkRole)[keyof typeof NetworkRole]

export const MemberStatus = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus]

export const ContentType = {
  SOCIAL_POST: "SOCIAL_POST",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  PDF_NOTICE: "PDF_NOTICE",
  NEWSLETTER: "NEWSLETTER",
  EVENT: "EVENT",
  JOB: "JOB",
} as const
export type ContentType = (typeof ContentType)[keyof typeof ContentType]

export const ContentVisibility = {
  PUBLIC: "PUBLIC",
  NETWORK: "NETWORK",
  GROUP: "GROUP",
} as const
export type ContentVisibility = (typeof ContentVisibility)[keyof typeof ContentVisibility]

export const NotificationType = {
  CONNECTION_REQUEST: "CONNECTION_REQUEST",
  CONNECTION_ACCEPTED: "CONNECTION_ACCEPTED",
  POST_LIKED: "POST_LIKED",
  POST_COMMENTED: "POST_COMMENTED",
  POST_MENTIONED: "POST_MENTIONED",
  GROUP_ADDED: "GROUP_ADDED",
  NEW_MESSAGE: "NEW_MESSAGE",
  ACCOUNT_VERIFIED: "ACCOUNT_VERIFIED",
  ACCOUNT_REJECTED: "ACCOUNT_REJECTED",
  ANNOUNCEMENT: "ANNOUNCEMENT",
  NEWSLETTER: "NEWSLETTER",
} as const
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType]

export const NotificationChannel = {
  IN_APP: "IN_APP",
  PUSH: "PUSH",
  EMAIL: "EMAIL",
} as const
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel]

// ─────────────────────────────────────────────────────────────────────────────
// SHARED USER / PROFILE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal author shape embedded in feed items and comments. */
export interface AuthorSummary {
  userId: string
  username: string
  fullName: string | null
  headline: string | null
  profileImage: string | null
}

/** Network summary embedded in feed items. */
export interface NetworkSummary {
  networkId: string
  name: string
  code: string
  logoUrl: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE & TIMEZONE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export * from "./utils/date.js"
