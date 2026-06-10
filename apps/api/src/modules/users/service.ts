/**
 * src/modules/users/service.ts
 *
 * User / Profile business logic.
 *
 * Profile cache: key = `profile:{userId}`, TTL = 600s ± 60s (jitter).
 */

import { db } from "../../config/db.js"
import { redis } from "../../config/redis.js"
import { logger } from "../../config/logger.js"
import type {
  UpdateProfileInput,
  CreateExperienceInput,
  UpdateExperienceInput,
  AddSkillInput,
} from "./schemas.js"

// ── Cache helpers ─────────────────────────────────────────────────────────────

function profileCacheKey(userId: string): string {
  return `profile:${userId}`
}

/** TTL with ±10% jitter (architecture rule). */
function jitteredTtl(base: number): number {
  const deviation = base * 0.1
  const jitter = (Math.random() * 2 - 1) * deviation

  return Math.floor(base + jitter)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileResponse {
  userId: string
  username: string
  email: string
  emailVerified: boolean
  globalRole: string
  profile: {
    fullName: string | null
    headline: string | null
    bio: string | null
    country: string | null
    state: string | null
    city: string | null
    locality: string | null
    profileImage: string | null
    linkedinUrl: string | null
    publicEmail: string | null
  } | null
  educations: Array<{
    eduId: string
    degree: string | null
    field: string | null
    startYear: number | null
    endYear: number | null
    isVerified: boolean
    network: { name: string; code: string } | null
  }>
  workExperiences: Array<{
    expId: string
    title: string
    company: string
    location: string | null
    startDate: Date
    endDate: Date | null
    description: string | null
  }>
  skills: Array<{ skillId: number; name: string }>
  networkMemberships: Array<{
    networkId: string
    role: string
    status: string
    network: { name: string; code: string; logoUrl: string | null }
  }>
}

// ── Service Functions ─────────────────────────────────────────────────────────

/**
 * Get the authenticated user's own full profile.
 * Includes educations, work experience, skills, and network memberships.
 * Results are cached in Redis.
 */
export async function getMe(userId: string): Promise<ProfileResponse> {
  const cacheKey = profileCacheKey(userId)
  const cached = await redis.get(cacheKey)

  if (cached) {
    return JSON.parse(cached) as ProfileResponse
  }

  const user = await db.user.findUnique({
    where: { userId },
    select: {
      userId: true,
      username: true,
      email: true,
      emailVerified: true,
      globalRole: true,
      profile: {
        select: {
          fullName: true,
          headline: true,
          bio: true,
          country: true,
          state: true,
          city: true,
          locality: true,
          profileImage: true,
          linkedinUrl: true,
          publicEmail: true,
        },
      },
      educations: {
        select: {
          eduId: true,
          degree: true,
          field: true,
          startYear: true,
          endYear: true,
          isVerified: true,
          network: { select: { name: true, code: true } },
        },
      },
      workExperiences: {
        select: {
          expId: true,
          title: true,
          company: true,
          location: true,
          startDate: true,
          endDate: true,
          description: true,
        },
        orderBy: { startDate: "desc" },
      },
      userSkills: {
        select: { skill: { select: { skillId: true, name: true } } },
      },
      networkMemberships: {
        select: {
          networkId: true,
          role: true,
          status: true,
          network: { select: { name: true, code: true, logoUrl: true } },
        },
      },
    },
  })

  if (!user) {
    throw Object.assign(new Error("User not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  const response: ProfileResponse = {
    userId: user.userId,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    globalRole: user.globalRole,
    profile: user.profile,
    educations: user.educations.map((e) => ({
      ...e,
      network: e.network,
    })),
    workExperiences: user.workExperiences,
    skills: user.userSkills.map((us) => us.skill),
    networkMemberships: user.networkMemberships,
  }

  await redis.setex(cacheKey, jitteredTtl(600), JSON.stringify(response))

  return response
}

/**
 * Update the authenticated user's profile fields.
 * Invalidates the profile cache after update.
 */
export async function updateMe(userId: string, input: UpdateProfileInput): Promise<void> {
  await db.profile.upsert({
    where: { userId },
    create: {
      userId,
      fullName: input.fullName ?? null,
      headline: input.headline ?? null,
      bio: input.bio ?? null,
      country: input.country ?? null,
      state: input.state ?? null,
      city: input.city ?? null,
      locality: input.locality ?? null,
      linkedinUrl: input.linkedinUrl || null,
      publicEmail: input.publicEmail || null,
    },
    update: {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.headline !== undefined && { headline: input.headline }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.locality !== undefined && { locality: input.locality }),
      ...(input.linkedinUrl !== undefined && {
        linkedinUrl: input.linkedinUrl || null,
      }),
      ...(input.publicEmail !== undefined && {
        publicEmail: input.publicEmail || null,
      }),
    },
  })

  // Invalidate cache.
  await redis.del(profileCacheKey(userId))
  logger.debug({ userId }, "[Users] profile updated, cache invalidated")
}

/** Public profile — only available for VERIFIED users. */
export interface PublicProfileResponse {
  userId: string
  username: string
  profile: {
    fullName: string | null
    headline: string | null
    bio: string | null
    city: string | null
    country: string | null
    profileImage: string | null
    linkedinUrl: string | null
    publicEmail: string | null
  } | null
  workExperiences: Array<{
    title: string
    company: string
    location: string | null
    startDate: Date
    endDate: Date | null
  }>
  skills: Array<{ skillId: number; name: string }>
  networkMemberships: Array<{
    role: string
    network: { name: string; code: string; logoUrl: string | null }
  }>
}

/**
 * Get a public user profile.
 * Only accessible by authenticated users.
 * Returns 404 if the target user has no VERIFIED membership in any network.
 */
export async function getUserById(targetUserId: string): Promise<PublicProfileResponse> {
  const user = await db.user.findUnique({
    where: { userId: targetUserId },
    select: {
      userId: true,
      username: true,
      profile: {
        select: {
          fullName: true,
          headline: true,
          bio: true,
          city: true,
          country: true,
          profileImage: true,
          linkedinUrl: true,
          publicEmail: true,
        },
      },
      workExperiences: {
        select: {
          title: true,
          company: true,
          location: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { startDate: "desc" },
        take: 10,
      },
      userSkills: {
        select: { skill: { select: { skillId: true, name: true } } },
      },
      networkMemberships: {
        where: { status: "VERIFIED" },
        select: {
          role: true,
          network: { select: { name: true, code: true, logoUrl: true } },
        },
      },
    },
  })

  if (!user) {
    throw Object.assign(new Error("User not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  // Ensure the user is verified in at least one network.
  if (user.networkMemberships.length === 0) {
    throw Object.assign(new Error("This profile is not yet available — user is not verified"), {
      code: "PROFILE_NOT_AVAILABLE",
      status: 403,
    })
  }

  return {
    userId: user.userId,
    username: user.username,
    profile: user.profile,
    workExperiences: user.workExperiences,
    skills: user.userSkills.map((us) => us.skill),
    networkMemberships: user.networkMemberships,
  }
}

// ── Profile cache invalidation ────────────────────────────────────────────────

async function invalidateProfileCache(userId: string): Promise<void> {
  await redis.del(profileCacheKey(userId))
}

// ── Education ─────────────────────────────────────────────────────────────────

export interface EducationItem {
  eduId: string
  degree: string | null
  field: string | null
  startYear: number | null
  endYear: number | null
  isVerified: boolean
  network: { networkId: string; name: string; code: string }
}

export async function getMyEducation(userId: string): Promise<EducationItem[]> {
  const rows = await db.education.findMany({
    where: { userId },
    select: {
      eduId: true,
      degree: true,
      field: true,
      startYear: true,
      endYear: true,
      isVerified: true,
      network: { select: { networkId: true, name: true, code: true } },
    },
    orderBy: { startYear: "desc" },
  })

  return rows
}

// ── Work experience ───────────────────────────────────────────────────────────

export interface ExperienceItem {
  expId: string
  title: string
  company: string
  location: string | null
  startDate: string
  endDate: string | null
  description: string | null
}

function toExperienceItem(row: {
  expId: string
  title: string
  company: string
  location: string | null
  startDate: Date
  endDate: Date | null
  description: string | null
}): ExperienceItem {
  return {
    expId: row.expId,
    title: row.title,
    company: row.company,
    location: row.location,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    description: row.description,
  }
}

export async function createExperience(
  userId: string,
  input: CreateExperienceInput,
): Promise<ExperienceItem> {
  const row = await db.workExperience.create({
    data: {
      userId,
      title: input.title,
      company: input.company,
      location: input.location ?? null,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      description: input.description ?? null,
    },
  })

  await invalidateProfileCache(userId)
  return toExperienceItem(row)
}

export async function updateExperience(
  userId: string,
  expId: string,
  input: UpdateExperienceInput,
): Promise<ExperienceItem> {
  const existing = await db.workExperience.findFirst({
    where: { expId, userId },
  })

  if (!existing) {
    throw Object.assign(new Error("Work experience not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  const row = await db.workExperience.update({
    where: { expId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.company !== undefined && { company: input.company }),
      ...(input.location !== undefined && { location: input.location ?? null }),
      ...(input.startDate !== undefined && {
        startDate: new Date(input.startDate),
      }),
      ...(input.endDate !== undefined && {
        endDate: input.endDate ? new Date(input.endDate) : null,
      }),
      ...(input.description !== undefined && {
        description: input.description ?? null,
      }),
    },
  })

  await invalidateProfileCache(userId)
  return toExperienceItem(row)
}

export async function deleteExperience(
  userId: string,
  expId: string,
): Promise<void> {
  const result = await db.workExperience.deleteMany({
    where: { expId, userId },
  })

  if (result.count === 0) {
    throw Object.assign(new Error("Work experience not found"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  await invalidateProfileCache(userId)
}

// ── Skills ────────────────────────────────────────────────────────────────────

export async function addSkill(
  userId: string,
  input: AddSkillInput,
): Promise<{ skillId: number; name: string }> {
  const name = input.name.trim()

  let skill = await db.skill.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  })

  if (!skill) {
    skill = await db.skill.create({ data: { name } })
  }

  await db.userSkill.upsert({
    where: { userId_skillId: { userId, skillId: skill.skillId } },
    create: { userId, skillId: skill.skillId },
    update: {},
  })

  await invalidateProfileCache(userId)
  return { skillId: skill.skillId, name: skill.name }
}

export async function removeSkill(
  userId: string,
  skillId: number,
): Promise<void> {
  const result = await db.userSkill.deleteMany({
    where: { userId, skillId },
  })

  if (result.count === 0) {
    throw Object.assign(new Error("Skill not found on your profile"), {
      code: "NOT_FOUND",
      status: 404,
    })
  }

  await invalidateProfileCache(userId)
}
