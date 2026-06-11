import { task } from "@trigger.dev/sdk/v3"
import { db } from "../config/db.js"
import { getSignedUrl } from "../services/storage/index.js"
import { parseExcelBuffer } from "../lib/excel-parser.js"
import { sanitizeRosterRows } from "../lib/roster-sanitizer.js"
import { sendRaw } from "../services/email/index.js"
import { logger } from "../config/logger.js"
import { redis } from "../config/redis.js"
import { jitteredTtl } from "../lib/cache.js"
import { normalizeEntryNumber } from "../lib/entry-number.js"
import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"

// ── Task 1: parseAndSanitizeRoster ────────────────────────────────────────────

export const parseAndSanitizeRoster = task({
  id: "parse-and-sanitize-roster",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30_000 },
  run: async (payload: { sessionId: string; r2Key: string }) => {
    const { sessionId, r2Key } = payload

    const signedUrl = await getSignedUrl(r2Key, 900)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`R2 fetch failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: "SANITIZING" },
    })

    const { headers, rows } = parseExcelBuffer(buffer)

    // Initial sanitization with no mappings — all cols land in meta
    const result = sanitizeRosterRows(rows, [])

    // Checksum calculation (SHA-256)
    const checksum = createHash("sha256").update(buffer).digest("hex")

    // Duplicate checksum check (warning only, last 5 uploads)
    const currentSession = await db.rosterUploadSession.findUniqueOrThrow({
      where: { sessionId },
      select: { networkId: true },
    })
    const lastSessions = await db.rosterUploadSession.findMany({
      where: {
        networkId: currentSession.networkId,
        NOT: { sessionId },
        status: { in: ["COMPLETE", "READY_TO_MERGE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { checksum: true },
    })
    const duplicateUploadWarning = lastSessions.some((s) => s.checksum === checksum)

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: {
        status: "SANITIZED",
        checksum,
        mergeSummary: {
          detectedHeaders: headers,
          totalRows: rows.length,
          cleanRows: result.clean.length,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 100) as any, // cap for storage
          duplicateUploadWarning,
        },
      },
    })

    logger.info({ sessionId, cleanRows: result.clean.length }, "[Task:parseAndSanitizeRoster] done")
  },
})

// ── Task 2: analyzeRosterConflicts ───────────────────────────────────────────

export const analyzeRosterConflicts = task({
  id: "analyze-roster-conflicts",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 30_000 },
  run: async (payload: { sessionId: string; networkId: string }) => {
    const { sessionId, networkId } = payload
    const analysisStart = Date.now()

    // Guard: payload must have valid sessionId
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error(`[analyzeRosterConflicts] Invalid payload: sessionId is "${sessionId}"`)
    }

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: "ANALYZING" },
    })

    const mappings = await db.rosterColumnMapping.findMany({ where: { sessionId } })
    const session = await db.rosterUploadSession.findUniqueOrThrow({ where: { sessionId } })

    const signedUrl = await getSignedUrl(session.r2Key, 900)
    const response = await fetch(signedUrl)
    if (!response.ok) throw new Error(`R2 fetch failed: ${response.status}`)
    const buffer = Buffer.from(await response.arrayBuffer())

    const { rows } = parseExcelBuffer(buffer)

    // Build lists for intra-file duplicates
    const entryNumberToRowIndices = new Map<string, number[]>()
    const emailToRowIndices = new Map<string, number[]>()

    // Pre-process and extract mapped rows
    const processedRows: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const rowIndex = i + 2 // 1-based + 1 for header row
      const row = rows[i]
      if (!row) continue

      const mappedRow: Record<string, any> = { meta: {} }
      for (const m of mappings) {
        const rawVal = row[m.excelHeader]
        const val = typeof rawVal === "string" ? rawVal.trim() : rawVal
        if (m.isCoreField && m.coreField) {
          mappedRow[m.coreField] = val
        } else {
          mappedRow.meta[m.templateVar] = val
        }
      }

      const rawEntry = mappedRow.entryNumber
      const entryNumber = rawEntry ? normalizeEntryNumber(String(rawEntry)) : null
      const rawEmail = mappedRow.email
      const email = rawEmail ? String(rawEmail).toLowerCase().trim() : null
      const fullName = mappedRow.fullName ? String(mappedRow.fullName).trim() : null
      const branch = mappedRow.branch ? String(mappedRow.branch).trim() : null
      const batch = mappedRow.batch ? parseInt(String(mappedRow.batch), 10) : null
      const role = mappedRow.role ? String(mappedRow.role).toUpperCase().trim() : null

      processedRows.push({
        rowIndex,
        entryNumber,
        fullName,
        email,
        branch,
        batch,
        role,
        meta: mappedRow.meta,
        rawEntry,
        rawEmail,
        rawBatch: mappedRow.batch,
        rawFullName: mappedRow.fullName,
        rawRole: mappedRow.role,
        conflicts: [],
      })

      if (entryNumber) {
        const list = entryNumberToRowIndices.get(entryNumber) || []
        list.push(rowIndex)
        entryNumberToRowIndices.set(entryNumber, list)
      }
      if (email) {
        const list = emailToRowIndices.get(email) || []
        list.push(rowIndex)
        emailToRowIndices.set(email, list)
      }
    }

    // Filter out rows missing entry number (skipped)
    const skippedRows: any[] = []
    const validProcessedRows: any[] = []

    for (const pRow of processedRows) {
      if (!pRow.entryNumber) {
        skippedRows.push({
          rowIndex: pRow.rowIndex,
          reason: "MISSING_ENTRY_NUMBER",
          rawEntry: pRow.rawEntry,
        })
      } else {
        validProcessedRows.push(pRow)
      }
    }

    // Database lookups
    const existingRecords = await db.rosterRecord.findMany({
      where: { networkId },
      select: {
        entryNumber: true,
        fullName: true,
        email: true,
        branch: true,
        batch: true,
        role: true,
        meta: true,
        removedFromRoster: true,
      },
    })
    const existingRecordsMap = new Map(existingRecords.map((r) => [r.entryNumber, r]))

    const claimedRequests = await db.verificationRequest.findMany({
      where: {
        networkId,
        entryNumber: { in: Array.from(entryNumberToRowIndices.keys()) },
        status: "VERIFIED",
      },
      select: { entryNumber: true },
    })
    const claimedEntryNumbers = new Set(
      claimedRequests.map((r) => r.entryNumber).filter(Boolean) as string[],
    )

    const uploadedEmails = Array.from(emailToRowIndices.keys())
    const existingUsers = await db.user.findMany({
      where: { email: { in: uploadedEmails } },
      select: { email: true, userId: true },
    })
    const existingUserEmailsMap = new Map(existingUsers.map((u) => [u.email, u.userId]))

    // Classify conflicts
    for (const pRow of validProcessedRows) {
      const { entryNumber, email, role, batch } = pRow
      const rowErrors: any[] = []

      // 1. Zod format validations
      if (email) {
        const emailSchema = z.string().email()
        const parsedEmail = emailSchema.safeParse(email)
        if (!parsedEmail.success) {
          rowErrors.push({
            conflictType: "VALIDATION_ERROR",
            field: "email",
            currentValue: null,
            incomingValue: pRow.rawEmail,
            message: `Invalid email address format: "${pRow.rawEmail}"`,
          })
        }
      }

      if (pRow.rawBatch !== undefined && pRow.rawBatch !== null && pRow.rawBatch !== "") {
        if (isNaN(batch) || batch < 1990 || batch > 2030) {
          rowErrors.push({
            conflictType: "VALIDATION_ERROR",
            field: "batch",
            currentValue: null,
            incomingValue: String(pRow.rawBatch),
            message: `Batch year must be between 1990 and 2030, got "${pRow.rawBatch}"`,
          })
        }
      }

      if (role) {
        if (!["STUDENT", "ALUMNI", "FACULTY"].includes(role)) {
          rowErrors.push({
            conflictType: "VALIDATION_ERROR",
            field: "role",
            currentValue: null,
            incomingValue: pRow.rawRole,
            message: `Role must be exactly STUDENT, ALUMNI, or FACULTY (case-sensitive). Rejecting "${pRow.rawRole}"`,
          })
        }
      }

      if (pRow.rawFullName !== undefined && (!pRow.fullName || pRow.fullName === "")) {
        rowErrors.push({
          conflictType: "VALIDATION_ERROR",
          field: "fullName",
          currentValue: null,
          incomingValue: String(pRow.rawFullName),
          message: "Full name is required and cannot be empty",
        })
      }

      // 2. Intra-file duplicate checks
      const isDuplicateEntryInFile = (entryNumberToRowIndices.get(entryNumber)?.length ?? 0) > 1
      const isDuplicateEmailInFile = email ? (emailToRowIndices.get(email)?.length ?? 0) > 1 : false

      if (isDuplicateEntryInFile) {
        rowErrors.push({
          conflictType: "DUPLICATE_ENTRY_IN_FILE",
          field: "entryNumber",
          currentValue: null,
          incomingValue: entryNumber,
          message: `Duplicate entry number "${entryNumber}" found multiple times in this file`,
        })
      }
      if (isDuplicateEmailInFile) {
        rowErrors.push({
          conflictType: "DUPLICATE_EMAIL_IN_FILE",
          field: "email",
          currentValue: null,
          incomingValue: email,
          message: `Duplicate email "${email}" found multiple times in this file`,
        })
      }

      // 3. Database conflicts
      const existing = existingRecordsMap.get(entryNumber)
      const isClaimed = claimedEntryNumbers.has(entryNumber)
      const existingUserIdForEmail = email ? existingUserEmailsMap.get(email) : null

      let mergeAction: "NEW" | "UPDATE" | "SKIP" = "NEW"
      if (isDuplicateEntryInFile) {
        mergeAction = "SKIP"
      } else if (existing) {
        mergeAction = "UPDATE"
      }

      pRow.mergeAction = mergeAction

      if (mergeAction === "UPDATE" && existing) {
        const fieldsToCompare = [
          { name: "fullName", current: existing.fullName, incoming: pRow.fullName },
          { name: "email", current: existing.email, incoming: pRow.email },
          { name: "branch", current: existing.branch, incoming: pRow.branch },
          { name: "batch", current: existing.batch, incoming: pRow.batch },
          { name: "role", current: existing.role, incoming: pRow.role },
        ]

        for (const field of fieldsToCompare) {
          const curVal = field.current === null ? "" : String(field.current).trim()
          const incVal = field.incoming === null ? "" : String(field.incoming).trim()
          const isDifferent =
            field.name === "email"
              ? curVal.toLowerCase() !== incVal.toLowerCase()
              : curVal !== incVal

          if (field.current !== null && field.incoming !== null && isDifferent) {
            rowErrors.push({
              conflictType: "FIELD_VALUE_CONFLICT",
              field: field.name,
              currentValue: String(field.current),
              incomingValue: String(field.incoming),
              message: `Field "${field.name}" differs: DB has "${field.current}", file has "${field.incoming}"`,
            })
          }
        }
      }

      if (existingUserIdForEmail) {
        rowErrors.push({
          conflictType: "EMAIL_CONFLICT",
          field: "email",
          currentValue: null,
          incomingValue: email,
          message: `Email "${email}" is registered to user ID ${existingUserIdForEmail}`,
        })
      }

      if (isClaimed && mergeAction === "UPDATE") {
        rowErrors.push({
          conflictType: "CLAIMED_RECORD",
          field: null,
          currentValue: null,
          incomingValue: null,
          message: `Entry number "${entryNumber}" is verified by a registered student profile.`,
        })
      }

      if (existing?.removedFromRoster && mergeAction === "UPDATE") {
        rowErrors.push({
          conflictType: "REMOVED_RECORD",
          field: null,
          currentValue: null,
          incomingValue: null,
          message: "This record was previously marked as removed. Merging will reactivate it.",
        })
      }

      pRow.conflicts = rowErrors
    }

    // Counts
    let newCount = 0
    let updateCount = 0
    let skipCount = 0
    let errorCount = 0
    let conflictCount = 0
    let claimedCount = 0
    let requiresResolutionCount = 0

    const conflictRows: any[] = []

    for (const row of validProcessedRows) {
      if (row.mergeAction === "NEW") newCount++
      if (row.mergeAction === "UPDATE") updateCount++
      if (row.mergeAction === "SKIP") skipCount++

      const hasValError = row.conflicts.some((c: any) => c.conflictType === "VALIDATION_ERROR")
      const hasNonValConflicts = row.conflicts.some(
        (c: any) =>
          c.conflictType !== "VALIDATION_ERROR" && c.conflictType !== "DUPLICATE_ENTRY_IN_FILE",
      )
      const hasClaimed = row.conflicts.some((c: any) => c.conflictType === "CLAIMED_RECORD")

      if (hasValError) errorCount++
      if (hasNonValConflicts) conflictCount++
      if (hasClaimed) claimedCount++

      if (hasNonValConflicts) {
        requiresResolutionCount++
      }

      if (row.conflicts.length > 0) {
        conflictRows.push(row)
      }
    }

    const uploadedEntryNumbers = new Set(
      processedRows.map((r) => r.entryNumber).filter(Boolean) as string[],
    )
    const activeExistingCount = existingRecords.filter((r) => !r.removedFromRoster).length
    const removedCount = existingRecords.filter(
      (r) => !r.removedFromRoster && !uploadedEntryNumbers.has(r.entryNumber),
    ).length

    const requiresDoubleConfirmation = removedCount > activeExistingCount * 0.3

    // Store paginated conflicts in Redis
    const conflictPageSize = 500
    const conflictPageCount = Math.ceil(conflictRows.length / conflictPageSize)

    for (let p = 0; p < conflictPageCount; p++) {
      const pageSlice = conflictRows.slice(p * conflictPageSize, (p + 1) * conflictPageSize)
      const ttl = jitteredTtl(48 * 3600)
      await redis.set(
        `roster:conflicts:${sessionId}:${p + 1}`,
        JSON.stringify(pageSlice),
        "EX",
        ttl,
      )
    }

    const nextStatus = conflictCount + errorCount > 0 ? "CONFLICT_REVIEW" : "READY_TO_MERGE"
    const analysisMs = Date.now() - analysisStart

    const summary = {
      totalRows: rows.length,
      newCount,
      updateCount,
      skipCount: skipCount + skippedRows.length,
      errorCount,
      conflictCount,
      claimedCount,
      requiresResolutionCount,
      removedCount,
      conflictPageCount,
      requiresDoubleConfirmation,
      analysisMs,
    }

    await db.rosterUploadSession.update({
      where: { sessionId },
      data: {
        status: nextStatus as any,
        mergeSummary: summary,
      },
    })

    logger.info(
      { sessionId, status: nextStatus, conflictsCount: conflictRows.length },
      "[Task:analyzeRosterConflicts] completed",
    )
  },
})

// ── Task 3: mergeRosterRecords ────────────────────────────────────────────────

export const mergeRosterRecords = task({
  id: "merge-roster-records",
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 3000, maxTimeoutInMs: 60_000 },
  run: async (payload: { sessionId: string; adminUserId: string }) => {
    const { sessionId, adminUserId } = payload

    const lockKey = `lock:roster:merge:${sessionId}`
    const lockTtl = jitteredTtl(1800)
    const acquired = await redis.set(lockKey, "1", "PX", lockTtl * 1000, "NX")
    if (!acquired) {
      logger.warn(
        { sessionId },
        "[Task:mergeRosterRecords] lock already held, skipping duplicate task execution",
      )
      return
    }

    const mergeStart = Date.now()

    try {
      const session = await db.rosterUploadSession.findUniqueOrThrow({
        where: { sessionId },
        include: { columnMappings: true },
      })

      const summary = session.mergeSummary as any
      const pageCount = summary?.conflictPageCount ?? 0

      // Generate fresh signed URL inside task
      const signedUrl = await getSignedUrl(session.r2Key, 900)
      const response = await fetch(signedUrl)
      if (!response.ok) throw new Error(`R2 fetch failed: ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())

      const { rows } = parseExcelBuffer(buffer)

      const existing = await db.rosterRecord.findMany({
        where: { networkId: session.networkId },
        select: { entryNumber: true },
      })
      const existingSet = new Set(existing.map((r) => r.entryNumber))

      const resolutions = await redis.hgetall(`roster:resolutions:${sessionId}`)

      // Classify into buckets
      const insertRows: any[] = []
      const upsertRows: any[] = []
      const touchRows: string[] = []
      const skipRows: string[] = []

      // Track duplicates
      const entryNumberToRowIndices = new Map<string, number[]>()
      for (let i = 0; i < rows.length; i++) {
        const rowIndex = i + 2
        const row = rows[i]
        if (!row) continue

        let rawEntry: any = null
        for (const m of session.columnMappings) {
          if (m.isCoreField && m.coreField === "entryNumber") {
            rawEntry = row[m.excelHeader]
          }
        }
        const entryNumber = rawEntry ? normalizeEntryNumber(String(rawEntry)) : null
        if (entryNumber) {
          const list = entryNumberToRowIndices.get(entryNumber) || []
          list.push(rowIndex)
          entryNumberToRowIndices.set(entryNumber, list)
        }
      }

      const uploadedEntryNumbers = new Set<string>()

      for (let i = 0; i < rows.length; i++) {
        const rowIndex = i + 2
        const row = rows[i]
        if (!row) continue

        const mappedRow: Record<string, any> = { meta: {} }
        for (const m of session.columnMappings) {
          const rawVal = row[m.excelHeader]
          const val = typeof rawVal === "string" ? rawVal.trim() : rawVal
          if (m.isCoreField && m.coreField) {
            mappedRow[m.coreField] = val
          } else {
            mappedRow.meta[m.templateVar] = val
          }
        }

        const entryNumber = mappedRow.entryNumber
          ? normalizeEntryNumber(String(mappedRow.entryNumber))
          : null
        if (!entryNumber) continue

        uploadedEntryNumbers.add(entryNumber)

        const email = mappedRow.email ? String(mappedRow.email).toLowerCase().trim() : null
        const fullName = mappedRow.fullName ? String(mappedRow.fullName).trim() : null
        const branch = mappedRow.branch ? String(mappedRow.branch).trim() : null
        const batch = mappedRow.batch ? parseInt(String(mappedRow.batch), 10) : null
        const role = mappedRow.role ? String(mappedRow.role).toUpperCase().trim() : null

        const isDuplicateEntryInFile = (entryNumberToRowIndices.get(entryNumber)?.length ?? 0) > 1
        const hasFormatError =
          (email && !z.string().email().safeParse(email).success) ||
          (mappedRow.batch && (isNaN(batch!) || batch! < 1990 || batch! > 2030)) ||
          (role && !["STUDENT", "ALUMNI", "FACULTY"].includes(role)) ||
          (mappedRow.fullName !== undefined && (!fullName || fullName === ""))

        const decision = resolutions[String(rowIndex)] // 'ACCEPT_INCOMING' | 'KEEP_EXISTING' | 'SKIP_ROW'

        if (hasFormatError || isDuplicateEntryInFile || decision === "SKIP_ROW") {
          skipRows.push(entryNumber)
          continue
        }

        const exists = existingSet.has(entryNumber)

        if (!exists) {
          insertRows.push({
            networkId: session.networkId,
            entryNumber,
            fullName,
            email,
            branch,
            batch,
            role,
            meta: mappedRow.meta,
            firstSeenSession: sessionId,
            lastSeenSession: sessionId,
            removedFromRoster: false,
          })
        } else {
          if (decision === "KEEP_EXISTING") {
            touchRows.push(entryNumber)
          } else {
            upsertRows.push({
              entryNumber,
              fullName,
              email,
              branch,
              batch,
              role,
              meta: mappedRow.meta,
            })
          }
        }
      }

      const removedEntryNumbers = Array.from(existingSet).filter(
        (e) => !uploadedEntryNumbers.has(e),
      )

      // ONE Database Transaction
      await db.$transaction(async (tx) => {
        // 1. insertRows
        if (insertRows.length > 0) {
          await tx.rosterRecord.createMany({
            data: insertRows,
            skipDuplicates: true,
          })
        }

        // 2. upsertRows (standard Prisma upsert loop)
        if (upsertRows.length > 0) {
          for (const r of upsertRows) {
            await tx.rosterRecord.upsert({
              where: {
                networkId_entryNumber: {
                  networkId: session.networkId,
                  entryNumber: r.entryNumber,
                },
              },
              create: {
                networkId: session.networkId,
                entryNumber: r.entryNumber,
                fullName: r.fullName,
                email: r.email,
                branch: r.branch,
                batch: r.batch,
                role: r.role,
                meta: r.meta,
                firstSeenSession: sessionId,
                lastSeenSession: sessionId,
                removedFromRoster: false,
              },
              update: {
                fullName: r.fullName,
                email: r.email,
                branch: r.branch,
                batch: r.batch,
                role: r.role,
                meta: r.meta,
                lastSeenSession: sessionId,
                removedFromRoster: false,
              },
            })
          }
        }

        // 3. touchRows
        if (touchRows.length > 0) {
          await tx.rosterRecord.updateMany({
            where: { networkId: session.networkId, entryNumber: { in: touchRows } },
            data: {
              lastSeenSession: sessionId,
              removedFromRoster: false,
              updatedAt: new Date(),
            },
          })
        }

        // 4. removedEntryNumbers
        if (removedEntryNumbers.length > 0) {
          await tx.rosterRecord.updateMany({
            where: { networkId: session.networkId, entryNumber: { in: removedEntryNumbers } },
            data: {
              removedFromRoster: true,
              updatedAt: new Date(),
            },
          })
        }
      })

      // Redis cleanup
      await redis.del(`roster:resolutions:${sessionId}`)
      await redis.del(`roster:removal-confirmed:${sessionId}`)
      for (let p = 1; p <= pageCount; p++) {
        await redis.del(`roster:conflicts:${sessionId}:${p}`)
      }
      await redis.del(lockKey)

      const mergeMs = Date.now() - mergeStart

      await db.rosterUploadSession.update({
        where: { sessionId },
        data: {
          status: "COMPLETE",
          mergedBy: adminUserId,
          mergedAt: new Date(),
          mergeSummary: {
            ...summary,
            inserted: insertRows.length,
            upserted: upsertRows.length,
            touched: touchRows.length,
            flaggedRemoved: removedEntryNumbers.length,
            skipped: skipRows.length,
            mergeMs,
          },
        },
      })

      logger.info(
        { sessionId, insertCount: insertRows.length, upsertCount: upsertRows.length },
        "[Task:mergeRosterRecords] done",
      )
    } catch (err) {
      logger.error({ sessionId, err }, "[Task:mergeRosterRecords] failed")
      await db.rosterUploadSession.update({
        where: { sessionId },
        data: { status: "FAILED" },
      })
      await redis.del(lockKey)
      throw err
    }
  },
})

// ── Task 4: sendEmailCampaign ─────────────────────────────────────────────────

export const sendEmailCampaign = task({
  id: "send-email-campaign",
  retry: { maxAttempts: 1 }, // Never retry bulk sends — use individual failure logs
  run: async (payload: { campaignId: string }) => {
    const { campaignId } = payload
    const campaign = await db.emailCampaign.findUniqueOrThrow({ where: { campaignId } })

    // Get most recent COMPLETE session's mappings for this network (for templateVar resolution)
    const latestSession = await db.rosterUploadSession.findFirst({
      where: { networkId: campaign.networkId, status: "COMPLETE" },
      orderBy: { createdAt: "desc" },
      include: { columnMappings: true },
    })

    const filter = campaign.filter as Record<string, unknown>
    // Build type-safe Prisma where from allowlisted filter keys
    const where: Record<string, unknown> = { networkId: campaign.networkId }
    for (const [key, val] of Object.entries(filter)) {
      if (["branch", "batch", "role", "removedFromRoster"].includes(key)) {
        where[key] = val
      }
    }

    let total = 0,
      sent = 0,
      failed = 0
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
        orderBy: { recordId: "asc" },
        take: 100,
      })

      if (records.length === 0) break
      cursor = records.at(-1)!.recordId
      batchNum++

      for (const record of records) {
        total++
        if (!record.email) continue // skip — no email

        // Build template variables: meta keys are already templateVar-keyed
        const vars: Record<string, string> = {
          studentName: record.fullName ?? "",
          batch: record.batch ? String(record.batch) : "",
          branch: record.branch ?? "",
          role: record.role ?? "",
          entryNumber: record.entryNumber,
          ...(record.meta as Record<string, string>),
        }

        // Render template — safe regex replacement
        const body = campaign.bodyTemplate.replace(
          /\{\{(\w+)\}\}/g,
          (_, key: string) => vars[key] ?? "",
        )

        try {
          await sendRaw({ to: record.email, subject: campaign.subject, html: body })
          sent++
        } catch (err: unknown) {
          failed++
          failedEmails.push(record.email)
          logger.warn(
            { campaignId, email: record.email, err },
            "[Task:sendEmailCampaign] send failed",
          )
          // Continue — do NOT throw, never retry bulk sends
        }
      }

      logger.info({ campaignId, batch: batchNum, sent, total }, "Campaign batch sent")
      // Delay 200ms between batches to rate limit email sending
      await new Promise((resolve) => setTimeout(resolve, 200))

      if (records.length < 100) break
    }

    await db.emailCampaign.update({
      where: { campaignId },
      data: {
        status: "COMPLETE",
        sendSummary: { total, sent, failed, failedEmails },
      },
    })

    logger.info({ campaignId, total, sent, failed }, "[Task:sendEmailCampaign] done")
  },
})
