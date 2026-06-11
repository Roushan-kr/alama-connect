import { z } from 'zod'

const FILTERABLE_ROSTER_FIELDS = ['branch', 'batch', 'role', 'removedFromRoster'] as const

export const SaveMappingsSchema = z.object({
  sessionId: z.uuid(),
  mappings: z.array(z.object({
    excelHeader: z.string().min(1),
    templateVar: z.string().min(1).regex(/^\w+$/, 'templateVar must be camelCase identifier'),
    isCoreField: z.boolean(),
    coreField: z.string().optional(),
  })).min(1),
})
export type SaveMappingsInput = z.infer<typeof SaveMappingsSchema>

export const ConfirmMergeSchema = z.object({
  sessionId: z.uuid(),
})

export const ListRecordsQuerySchema = z.object({
  networkId: z.uuid(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  branch: z.string().optional(),
  batch: z.coerce.number().int().optional(),
  role: z.enum(['STUDENT', 'ALUMNI', 'FACULTY']).optional(),
  removedFromRoster: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
})
export type ListRecordsQuery = z.infer<typeof ListRecordsQuerySchema>

export const CreateCampaignSchema = z.object({
  networkId: z.uuid(),
  name: z.string().min(1).max(200),
  subject: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1),
  filter: z
    .object({
      branch: z.string().optional(),
      batch: z.coerce.number().int().optional(),
      role: z.string().optional(),
      removedFromRoster: z.boolean().optional(),
      groupId: z.string().uuid().optional(),
    })
    .refine((f) => Object.keys(f).length > 0, {
      message: 'At least one filter field is required to prevent accidental network-wide sends',
    })
    .refine((f) => {
      if (f.groupId && (f.branch || f.batch || f.role || f.removedFromRoster !== undefined)) {
        return false;
      }
      return true;
    }, {
      message: 'groupId filter cannot be combined with other roster filters (branch, batch, role, removedFromRoster)',
    }),
  scheduledAt: z.coerce.date().optional(),
  sendImmediately: z.boolean().optional().default(false),
})
export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>

export const SendCampaignSchema = z.object({
  campaignId: z.uuid(),
})

export const ConflictResolutionSchema = z.object({
  resolutions: z.array(
    z.object({
      rowIndex: z.number().int().positive(),
      decision: z.enum(['ACCEPT_INCOMING', 'KEEP_EXISTING', 'SKIP_ROW']),
    })
  ),
  confirmRemoval: z.boolean().optional(),
})
export type ConflictResolutionInput = z.infer<typeof ConflictResolutionSchema>
