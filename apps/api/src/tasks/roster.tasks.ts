import { task } from '@trigger.dev/sdk/v3'
import { db } from '../config/db.js'
import { getSignedUrl } from '../services/storage/index.js'
import { parseExcelBuffer } from '../lib/excel-parser.js'
import { sanitizeRosterRows } from '../lib/roster-sanitizer.js'
import { sendRaw } from '../services/email/index.js'
import { logger } from '../config/logger.js'

// ── Task 1: parseAndSanitizeRoster ────────────────────────────────────────────

export const parseAndSanitizeRoster = task({
  id: 'parse-and-sanitize-roster',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30_000 },
  run: async (payload: { sessionId: string; r2Key: string }) => {
    const { sessionId, r2Key } = payload

    // Generate signed URL INSIDE the task — prevents stale-URL errors on retry
    const signedUrl = await getSignedUrl(r2Key, 900)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`R2 fetch failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: 'SANITIZING' },
    })

    const { headers, rows } = parseExcelBuffer(buffer)

    // Initial sanitization with no mappings — all cols land in meta
    const result = sanitizeRosterRows(rows, [])

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: {
        status: 'SANITIZED',
        mergeSummary: {
          detectedHeaders: headers,
          totalRows: rows.length,
          cleanRows: result.clean.length,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 100) as any, // cap for storage
        },
      },
    })

    logger.info({ sessionId, cleanRows: result.clean.length }, '[Task:parseAndSanitizeRoster] done')
  },
})

// ── Task 2: mergeRosterRecords ────────────────────────────────────────────────

/**
 * Merge Roster records task.
 * 
 * @cleanup On task failure, the session R2 file is not automatically cleaned up.
 * Tracks manual cleanup policy or future automated scheduler.
 */
export const mergeRosterRecords = task({
  id: 'merge-roster-records',
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 60_000 },
  run: async (payload: { sessionId: string }) => {
    const { sessionId } = payload

    const session = await db.rosterUploadSession.findUniqueOrThrow({
      where: { sessionId },
      include: { columnMappings: true },
    })

    // Generate fresh signed URL inside task
    const signedUrl = await getSignedUrl(session.r2Key, 900)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`R2 fetch failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const { rows } = parseExcelBuffer(buffer)
    const sanitizedMappings = session.columnMappings.map((m) => ({
      excelHeader: m.excelHeader,
      templateVar: m.templateVar,
      isCoreField: m.isCoreField,
      ...(m.coreField ? { coreField: m.coreField } : {}),
    }))
    const { clean, errors } = sanitizeRosterRows(rows, sanitizedMappings)

    let inserted = 0

    // Batch upsert in chunks of 500 sequentially to respect memory and DB connections
    for (let i = 0; i < clean.length; i += 500) {
      const chunk = clean.slice(i, i + 500)
      await db.$transaction(
        chunk.map((row) =>
          db.rosterRecord.upsert({
            where: { networkId_entryNumber: { networkId: session.networkId, entryNumber: row.entryNumber } },
            create: {
              networkId: session.networkId,
              entryNumber: row.entryNumber,
              ...(row.fullName !== undefined ? { fullName: row.fullName } : {}),
              ...(row.email !== undefined ? { email: row.email } : {}),
              ...(row.branch !== undefined ? { branch: row.branch } : {}),
              ...(row.batch !== undefined ? { batch: row.batch } : {}),
              ...(row.role !== undefined ? { role: row.role } : {}),
              meta: row.meta || {},
              firstSeenSession: sessionId,
              lastSeenSession: sessionId,
              removedFromRoster: false,
            },
            update: {
              ...(row.fullName !== undefined ? { fullName: row.fullName } : {}),
              ...(row.email !== undefined ? { email: row.email } : {}),
              ...(row.branch !== undefined ? { branch: row.branch } : {}),
              ...(row.batch !== undefined ? { batch: row.batch } : {}),
              ...(row.role !== undefined ? { role: row.role } : {}),
              meta: row.meta || {},
              lastSeenSession: sessionId,
              removedFromRoster: false,
            },
          })
        )
      )
      inserted += chunk.length
    }

    // Flag rows no longer in this upload — covers null lastSeenSession too (see Round 1 P1-3)
    const flagged = await db.rosterRecord.updateMany({
      where: {
        networkId: session.networkId,
        removedFromRoster: false,
        OR: [
          { lastSeenSession: null },
          { NOT: { lastSeenSession: sessionId } },
        ],
      },
      data: { removedFromRoster: true },
    })

    const summaryJson = {
      inserted,
      flaggedRemoved: flagged.count,
      errorCount: errors.length,
      errors: errors.slice(0, 100) as any,
    }

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: {
        status: 'COMPLETE',
        mergeSummary: summaryJson,
      },
    })

    logger.info({ sessionId, inserted, flaggedRemoved: flagged.count }, '[Task:mergeRosterRecords] done')
  },
})

// ── Task 3: sendEmailCampaign ─────────────────────────────────────────────────

export const sendEmailCampaign = task({
  id: 'send-email-campaign',
  retry: { maxAttempts: 1 },  // Never retry bulk sends — use individual failure logs
  run: async (payload: { campaignId: string }) => {
    const { campaignId } = payload
    const campaign = await db.emailCampaign.findUniqueOrThrow({ where: { campaignId } })

    // Get most recent COMPLETE session's mappings for this network (for templateVar resolution)
    const latestSession = await db.rosterUploadSession.findFirst({
      where: { networkId: campaign.networkId, status: 'COMPLETE' },
      orderBy: { createdAt: 'desc' },
      include: { columnMappings: true },
    })

    const filter = campaign.filter as Record<string, unknown>
    // Build type-safe Prisma where from allowlisted filter keys
    const where: Record<string, unknown> = { networkId: campaign.networkId }
    for (const [key, val] of Object.entries(filter)) {
      if (['branch', 'batch', 'role', 'removedFromRoster'].includes(key)) {
        where[key] = val
      }
    }

    let total = 0, sent = 0, failed = 0
    const failedEmails: string[] = []
    let cursor: string | undefined
    let batchNum = 0

    // Paginate in batches of 100
    while (true) {
      const records = await db.rosterRecord.findMany({
        where: {
          ...where,
          ...(cursor ? { recordId: { gt: cursor } } : {}),
        },
        orderBy: { recordId: 'asc' },
        take: 100,
      })

      if (records.length === 0) break
      cursor = records.at(-1)!.recordId
      batchNum++

      for (const record of records) {
        total++
        if (!record.email) continue  // skip — no email

        // Build template variables: meta keys are already templateVar-keyed
        const vars: Record<string, string> = {
          studentName: record.fullName ?? '',
          batch: record.batch ? String(record.batch) : '',
          branch: record.branch ?? '',
          role: record.role ?? '',
          entryNumber: record.entryNumber,
          ...(record.meta as Record<string, string>),
        }

        // Render template — safe regex replacement
        const body = campaign.bodyTemplate.replace(
          /\{\{(\w+)\}\}/g,
          (_, key: string) => vars[key] ?? ''
        )

        try {
          await sendRaw({ to: record.email, subject: campaign.subject, html: body })
          sent++
        } catch (err: unknown) {
          failed++
          failedEmails.push(record.email)
          logger.warn({ campaignId, email: record.email, err }, '[Task:sendEmailCampaign] send failed')
          // Continue — do NOT throw, never retry bulk sends
        }
      }

      logger.info({ campaignId, batch: batchNum, sent, total }, 'Campaign batch sent')
      // Delay 200ms between batches to rate limit email sending
      await new Promise((resolve) => setTimeout(resolve, 200))

      if (records.length < 100) break
    }

    await db.emailCampaign.update({
      where: { campaignId },
      data: {
        status: 'COMPLETE',
        sendSummary: { total, sent, failed, failedEmails },
      },
    })

    logger.info({ campaignId, total, sent, failed }, '[Task:sendEmailCampaign] done')
  },
})
