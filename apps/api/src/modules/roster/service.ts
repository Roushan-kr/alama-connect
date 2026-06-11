import { randomUUID } from 'node:crypto'
import { db } from '../../config/db.js'
import { logger } from '../../config/logger.js'
import { scanBuffer } from '../../services/storage/virusScan.js'
import { uploadFile, buildKey } from '../../services/storage/index.js'
import { parseAndSanitizeRoster, analyzeRosterConflicts, mergeRosterRecords, sendEmailCampaign } from '../../tasks/roster.tasks.js'
import type { SaveMappingsInput, ListRecordsQuery, CreateCampaignInput } from './schemas.js'

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadRosterExcel(
  adminUserId: string,
  networkId: string,
  fileBuffer: Buffer,
  originalName: string,
): Promise<{ sessionId: string; status: string }> {
  // 1. Virus scan first
  const scan = await scanBuffer(fileBuffer, originalName)
  if (!scan.clean) {
    throw Object.assign(
      new Error(`File rejected: malware detected (${scan.threat ?? 'unknown'})`),
      { code: 'FILE_INFECTED', status: 422 },
    )
  }

  const sessionId = randomUUID()
  const r2Key = buildKey('roster-uploads', networkId, `${sessionId}.xlsx`)

  // 2. Upload raw file to R2
  await uploadFile(fileBuffer, r2Key, 'application/octet-stream')

  // 3. Create session record
  await db.rosterUploadSession.create({
    data: {
      sessionId,
      networkId,
      uploadedBy: adminUserId,
      originalName,
      r2Key,
      status: 'PENDING',
    },
  })

  // 4. Fire Trigger.dev task — fire-and-forget
  await parseAndSanitizeRoster.trigger({ sessionId, r2Key })

  logger.info({ sessionId, networkId }, '[Roster] upload initiated')
  return { sessionId, status: 'PENDING' }
}

// ── Mappings ──────────────────────────────────────────────────────────────────

export async function saveMappings(
  sessionId: string,
  mappings: SaveMappingsInput['mappings'],
  adminUserId: string,
): Promise<void> {
  const session = await db.rosterUploadSession.findUnique({ where: { sessionId } })
  if (!session) throw Object.assign(new Error('Session not found'), { code: 'NOT_FOUND', status: 404 })
  if (session.uploadedBy !== adminUserId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }
  const remappableStatuses = ['SANITIZED', 'ANALYZING', 'CONFLICT_REVIEW', 'READY_TO_MERGE']
  if (!remappableStatuses.includes(session.status)) {
    throw Object.assign(
      new Error(`Mappings can only be saved when session status is one of: ${remappableStatuses.join(', ')}`),
      { code: 'INVALID_SESSION_STATE', status: 409 },
    )
  }

  // Validate: no duplicate templateVars
  const templateVars = mappings.map((m) => m.templateVar)
  if (new Set(templateVars).size !== templateVars.length) {
    throw Object.assign(
      new Error('Each mapping must have a unique templateVar'),
      { code: 'DUPLICATE_TEMPLATE_VAR', status: 400 },
    )
  }

  // Validate: entryNumber core field must be mapped — hard guard
  const hasEntryNumberMapping = mappings.some(
    (m) => m.isCoreField && m.coreField === 'entryNumber'
  )
  if (!hasEntryNumberMapping) {
    throw Object.assign(
      new Error(
        'A core field mapping for "entryNumber" is required before confirming the roster',
      ),
      { code: 'ENTRY_NUMBER_MAPPING_REQUIRED', status: 400 },
    )
  }

  // Replace existing mappings and mark session as MAPPED (analysis task will set ANALYZING)
  await db.$transaction([
    db.rosterColumnMapping.deleteMany({ where: { sessionId } }),
    db.rosterColumnMapping.createMany({
      data: mappings.map((m) => ({
        sessionId,
        excelHeader: m.excelHeader,
        templateVar: m.templateVar,
        isCoreField: m.isCoreField,
        ...(m.coreField !== undefined ? { coreField: m.coreField } : {}),
      })),
    }),
    db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: 'MAPPED' },
    }),
  ])

  // Trigger async analysis task — validate payload before firing
  const triggerPayload = { sessionId, networkId: session.networkId }
  if (!triggerPayload.sessionId || !triggerPayload.networkId) {
    throw new Error(`[saveMappings] Cannot trigger analysis: missing sessionId or networkId (sessionId=${triggerPayload.sessionId}, networkId=${triggerPayload.networkId})`)
  }
  await analyzeRosterConflicts.trigger(triggerPayload)
}

// ── Confirm Merge ─────────────────────────────────────────────────────────────

export async function confirmMerge(
  sessionId: string,
  adminUserId: string,
): Promise<void> {
  // Atomic check-and-update — prevents double-fire
  await db.$transaction(async (tx) => {
    const session = await tx.rosterUploadSession.findUniqueOrThrow({ where: { sessionId } })
    if (session.uploadedBy !== adminUserId) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
    }
    if (session.status !== 'READY_TO_MERGE') {
      throw Object.assign(
        new Error('Session must be in READY_TO_MERGE state to confirm merge'),
        { code: 'SESSION_NOT_READY', status: 409 },
      )
    }
    await tx.rosterUploadSession.update({
      where: { sessionId },
      data: { status: 'MERGING' },
    })
  })

  // Fire task only after transaction commits
  await mergeRosterRecords.trigger({ sessionId, adminUserId })
}

// ── Service utilities ─────────────────────────────────────────────────────────

export async function listSessions(networkId: string, limit = 20) {
  return db.rosterUploadSession.findMany({
    where: { networkId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getSession(sessionId: string, userId: string) {
  const session = await db.rosterUploadSession.findUniqueOrThrow({
    where: { sessionId },
    include: { columnMappings: true },
  })
  // Verify uploader or network admin permission
  const member = await db.networkMember.findUniqueOrThrow({
    where: { userId_networkId: { userId, networkId: session.networkId } },
  })
  if (member.role !== 'ADMIN') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }
  return session
}

export async function listRecords(query: ListRecordsQuery) {
  const { networkId, cursor, limit, branch, batch, role, removedFromRoster, search } = query

  const where: any = { networkId }
  if (branch) where.branch = branch
  if (batch) where.batch = batch
  if (role) where.role = role
  if (removedFromRoster !== undefined) where.removedFromRoster = removedFromRoster

  if (search) {
    // ILIKE matching on entryNumber or fullName GIN index query
    where.OR = [
      { entryNumber: { startsWith: search.toUpperCase().replace(/\s+/g, '') } },
      { fullName: { contains: search, mode: 'insensitive' } },
    ]
  }

  const records = await db.rosterRecord.findMany({
    where,
    orderBy: { recordId: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { recordId: cursor }, skip: 1 } : {}),
  })

  const hasMore = records.length > limit
  const items = hasMore ? records.slice(0, limit) : records
  const nextCursor = hasMore ? (items.at(-1)?.recordId ?? null) : null

  return { data: items, nextCursor }
}

export async function getRecord(entryNumber: string, userId: string) {
  const record = await db.rosterRecord.findFirstOrThrow({
    where: { entryNumber },
  })
  const member = await db.networkMember.findUniqueOrThrow({
    where: { userId_networkId: { userId, networkId: record.networkId } },
  })
  if (member.role !== 'ADMIN' && member.role !== 'FACULTY') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }
  return record
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function createCampaign(input: CreateCampaignInput, userId: string) {
  const member = await db.networkMember.findUniqueOrThrow({
    where: { userId_networkId: { userId, networkId: input.networkId } },
  })
  if (member.role !== 'ADMIN') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }

  const campaign = await db.emailCampaign.create({
    data: {
      networkId: input.networkId,
      createdBy: userId,
      name: input.name,
      subject: input.subject,
      bodyTemplate: input.bodyTemplate,
      filter: input.filter,
      scheduledAt: input.scheduledAt ?? null,
      status: input.sendImmediately ? 'SENDING' : 'DRAFT',
    },
  })

  if (input.sendImmediately) {
    await sendEmailCampaign.trigger({ campaignId: campaign.campaignId })
  }

  return campaign
}

export async function listCampaigns(networkId: string, limit = 20) {
  return db.emailCampaign.findMany({
    where: { networkId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getCampaign(campaignId: string, userId: string) {
  const campaign = await db.emailCampaign.findUniqueOrThrow({
    where: { campaignId },
  })
  const member = await db.networkMember.findUniqueOrThrow({
    where: { userId_networkId: { userId, networkId: campaign.networkId } },
  })
  if (member.role !== 'ADMIN' && member.role !== 'FACULTY') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }
  return campaign
}

export async function triggerCampaignSend(campaignId: string, userId: string) {
  const campaign = await db.emailCampaign.findUniqueOrThrow({ where: { campaignId } })
  const member = await db.networkMember.findUniqueOrThrow({
    where: { userId_networkId: { userId, networkId: campaign.networkId } },
  })
  if (member.role !== 'ADMIN') {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', status: 403 })
  }
  if (campaign.status !== 'DRAFT') {
    throw Object.assign(new Error('Campaign must be in draft status to send'), {
      code: 'INVALID_CAMPAIGN_STATE',
      status: 400,
    })
  }

  await db.emailCampaign.update({
    where: { campaignId },
    data: { status: 'SENDING' },
  })

  await sendEmailCampaign.trigger({ campaignId })
}
