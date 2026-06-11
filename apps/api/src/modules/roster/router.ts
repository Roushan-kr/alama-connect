import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { requireAuth } from '@/middleware/requireAuth.js'
import { requireRole, assertNetworkAdmin } from '@/middleware/requireRole.js'
import { redis } from '@/config/redis.js'
import { jitteredTtl } from '@/lib/cache.js'
import { getSignedUrl, deleteFile } from '@/services/storage/index.js'
import { db } from '@/config/db.js'
import { logger } from '@/config/logger.js'
import { z } from 'zod'
import {
  uploadRosterExcel,
  saveMappings,
  confirmMerge,
  listSessions,
  getSession,
  listRecords,
  getRecord,
  createCampaign,
  listCampaigns,
  getCampaign,
  triggerCampaignSend,
} from './service.js'
import {
  SaveMappingsSchema,
  ListRecordsQuerySchema,
  CreateCampaignSchema,
  ConflictResolutionSchema,
} from './schemas.js'

export const rosterRouter: FastifyPluginAsync = async (fastify) => {
  // GET /sample-download-url — requireAuth only (any user can download)
  fastify.get('/sample-download-url', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    // Check cache
    const cachedUrl = await redis.get('sample:roster:url')
    if (cachedUrl) {
      return reply.status(200).send({ data: { url: cachedUrl, expiresIn: 3600 } })
    }

    const r2Key = await redis.get('sample:roster:r2key')
    if (!r2Key) {
      return reply.status(404).send({
        error: 'Sample file not yet generated',
        code: 'SAMPLE_NOT_READY',
      })
    }

    const signedUrl = await getSignedUrl(r2Key, 3600)
    
    // Cache for 55 minutes with jitter
    const ttl = jitteredTtl(3300)
    await redis.set('sample:roster:url', signedUrl, 'EX', ttl)

    return reply.status(200).send({ data: { url: signedUrl, expiresIn: 3600 } })
  })

  // POST /upload — ADMIN only, networkId in query
  fastify.post('/upload', {
    preHandler: [requireAuth, requireRole('query', ['ADMIN'])],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const file = await req.file()
    if (!file) {
      return reply.status(400).send({ error: 'Excel file is required', code: 'VALIDATION_ERROR' })
    }
    const buffer = await file.toBuffer()
    const { networkId } = req.query as { networkId: string }
    const result = await uploadRosterExcel(
      req.user.userId,
      networkId,
      buffer,
      file.filename,
    )
    return reply.status(202).send({ data: result })
  })

  // GET /sessions — ADMIN+FACULTY, networkId in query
  fastify.get('/sessions', {
    preHandler: [requireAuth, requireRole('query', ['ADMIN', 'FACULTY'])],
  }, async (req, reply) => {
    const { networkId, limit } = req.query as { networkId: string; limit?: number }
    const sessions = await listSessions(networkId, limit)
    return reply.status(200).send({ data: sessions })
  })

  // GET /sessions/:sessionId — ADMIN+FACULTY
  fastify.get('/sessions/:sessionId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }
    const session = await getSession(sessionId, req.user.userId)
    return reply.status(200).send({ data: session })
  })

  // POST /sessions/:sessionId/retrigger-sanitize — Re-trigger stuck PENDING sessions
  fastify.post('/sessions/:sessionId/retrigger-sanitize', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }

    const session = await db.rosterUploadSession.findUnique({ where: { sessionId } })
    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' })
    }
    await assertNetworkAdmin(req.user.userId, session.networkId, req.user.globalRole)

    if (session.status !== 'PENDING' && session.status !== 'SANITIZING') {
      return reply.status(400).send({
        error: `Cannot re-trigger sanitization for session in status: ${session.status}`,
        code: 'INVALID_STATUS',
      })
    }

    // Reset to PENDING and re-trigger
    await db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: 'PENDING' },
    })

    const { parseAndSanitizeRoster } = await import('../../tasks/roster.tasks.js')
    await parseAndSanitizeRoster.trigger({ sessionId, r2Key: session.r2Key })

    logger.info({ sessionId }, '[Roster] sanitization re-triggered')
    return reply.status(202).send({ data: { sessionId, status: 'PENDING' } })
  })

  // POST /sessions/:sessionId/mappings — ADMIN only
  fastify.post('/sessions/:sessionId/mappings', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }
    const parsed = SaveMappingsSchema.parse({
      sessionId,
      mappings: (req.body as any)?.mappings,
    })
    await saveMappings(sessionId, parsed.mappings, req.user.userId)
    return reply.status(204).send()
  })

  // POST /sessions/:sessionId/confirm — ADMIN only
  fastify.post('/sessions/:sessionId/confirm', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }
    await confirmMerge(sessionId, req.user.userId)
    return reply.status(202).send()
  })

  // GET /sessions/:sessionId/conflicts — ADMIN only
  fastify.get('/sessions/:sessionId/conflicts', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }
    
    const { filter, page, limit } = z.object({
      filter: z.enum(['ALL', 'CONFLICTS', 'ERRORS']).default('ALL'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query)

    const session = await db.rosterUploadSession.findUnique({
      where: { sessionId },
    })
    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' })
    }
    await assertNetworkAdmin(req.user.userId, session.networkId, req.user.globalRole)

    const summary = (session.mergeSummary as any) || {}

    if (session.status === 'ANALYZING' || session.status === 'MAPPED') {
      return reply.status(202).send({ data: { status: 'ANALYZING' } })
    }

    if (session.status === 'COMPLETE' || session.status === 'FAILED' || session.status === 'CANCELLED') {
      return reply.status(200).send({
        data: {
          summary,
          rows: [],
          totalConflictRows: 0,
          page: 1,
          conflictsTruncated: false,
          sessionStatus: session.status,
        },
      })
    }

    if (session.status === 'PENDING' || session.status === 'SANITIZING' || session.status === 'SANITIZED') {
      return reply.status(400).send({ error: 'Mappings not saved yet', code: 'MAPPINGS_NOT_SAVED' })
    }

    const pageCount = summary.conflictPageCount ?? 0

    // If no conflict pages exist (clean upload with zero conflicts), return immediately
    if (pageCount === 0) {
      return reply.status(200).send({
        data: {
          summary,
          rows: [],
          totalConflictRows: 0,
          page: 1,
          conflictsTruncated: false,
          sessionStatus: session.status,
        },
      })
    }

    // Load paginated cache into memory
    const conflictRows: any[] = []
    let cacheExists = false
    for (let p = 1; p <= pageCount; p++) {
      const pageData = await redis.get(`roster:conflicts:${sessionId}:${p}`)
      if (pageData) {
        cacheExists = true
        conflictRows.push(...JSON.parse(pageData))
      }
    }

    if (!cacheExists) {
      return reply.status(404).send({
        error: 'Conflict data expired or not found',
        code: 'CONFLICTS_EXPIRED',
      })
    }

    // Apply filter
    let filteredRows = conflictRows
    if (filter === 'ERRORS') {
      filteredRows = conflictRows.filter((r) =>
        r.conflicts.some((c: any) => c.conflictType === 'VALIDATION_ERROR')
      )
    } else if (filter === 'CONFLICTS') {
      filteredRows = conflictRows.filter((r) =>
        r.conflicts.some((c: any) => c.conflictType !== 'VALIDATION_ERROR' && c.conflictType !== 'DUPLICATE_ENTRY_IN_FILE')
      )
    }

    // Paginate in memory
    const totalConflictRows = filteredRows.length
    const start = (page - 1) * limit
    const end = start + limit
    const paginatedRows = filteredRows.slice(start, end)

    return reply.status(200).send({
      data: {
        summary,
        rows: paginatedRows,
        totalConflictRows,
        page,
        conflictsTruncated: summary.conflictsTruncated ?? false,
        sessionStatus: session.status,
      },
    })
  })

  // POST /sessions/:sessionId/conflicts/resolve — ADMIN only
  fastify.post('/sessions/:sessionId/conflicts/resolve', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }

    const session = await db.rosterUploadSession.findUnique({
      where: { sessionId },
    })
    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' })
    }
    await assertNetworkAdmin(req.user.userId, session.networkId, req.user.globalRole)

    if (session.status !== 'CONFLICT_REVIEW') {
      return reply.status(400).send({
        error: `Resolutions can only be saved when status is CONFLICT_REVIEW, currently ${session.status}`,
        code: 'INVALID_STATUS',
      })
    }

    const { resolutions, confirmRemoval } = ConflictResolutionSchema.parse(req.body)

    const resolutionsKey = `roster:resolutions:${sessionId}`
    const ttl = jitteredTtl(48 * 3600)

    if (resolutions.length > 0) {
      const hsetArgs: string[] = []
      for (const r of resolutions) {
        hsetArgs.push(String(r.rowIndex), r.decision)
      }
      await redis.hset(resolutionsKey, hsetArgs)
      await redis.expire(resolutionsKey, ttl)
    }

    if (confirmRemoval !== undefined) {
      const removalConfirmedKey = `roster:removal-confirmed:${sessionId}`
      if (confirmRemoval) {
        await redis.set(removalConfirmedKey, '1', 'EX', ttl)
      } else {
        await redis.del(removalConfirmedKey)
      }
    }

    const resolvedCount = await redis.hlen(resolutionsKey)
    const summary = (session.mergeSummary as any) || {}
    const required = summary.requiresResolutionCount ?? 0

    let nextStatus: any = session.status
    if (resolvedCount >= required) {
      if (summary.requiresDoubleConfirmation) {
        const removalConfirmed = await redis.get(`roster:removal-confirmed:${sessionId}`)
        if (removalConfirmed === '1') {
          nextStatus = 'READY_TO_MERGE'
        }
      } else {
        nextStatus = 'READY_TO_MERGE'
      }
    }

    if (nextStatus !== session.status) {
      await db.rosterUploadSession.update({
        where: { sessionId },
        data: { status: nextStatus },
      })
    }

    return reply.status(200).send({
      data: {
        resolved: resolvedCount,
        remaining: Math.max(0, required - resolvedCount),
        status: nextStatus,
      },
    })
  })

  // DELETE /sessions/:sessionId — ADMIN only
  fastify.delete('/sessions/:sessionId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { sessionId } = req.params as { sessionId: string }

    const session = await db.rosterUploadSession.findUnique({
      where: { sessionId },
    })
    if (!session) {
      return reply.status(404).send({ error: 'Session not found', code: 'NOT_FOUND' })
    }
    await assertNetworkAdmin(req.user.userId, session.networkId, req.user.globalRole)

    const cancellableStatuses = ['PENDING', 'SANITIZING', 'SANITIZED', 'MAPPED', 'ANALYZING', 'CONFLICT_REVIEW', 'READY_TO_MERGE']
    if (!cancellableStatuses.includes(session.status)) {
      return reply.status(409).send({
        error: `Cannot cancel session in status: ${session.status}`,
        code: 'SESSION_NOT_CANCELLABLE',
      })
    }

    // Update status to CANCELLED
    await db.rosterUploadSession.update({
      where: { sessionId },
      data: { status: 'CANCELLED' },
    })

    // Delete R2 file
    try {
      await deleteFile(session.r2Key)
    } catch (err) {
      logger.error({ err, sessionId }, 'Failed to delete R2 file during cancel')
    }

    // Redis cleanup
    const summary = (session.mergeSummary as any) || {}
    const pageCount = summary.conflictPageCount ?? 0
    for (let p = 1; p <= pageCount; p++) {
      await redis.del(`roster:conflicts:${sessionId}:${p}`)
    }
    await redis.del(`roster:resolutions:${sessionId}`)
    await redis.del(`roster:removal-confirmed:${sessionId}`)

    return reply.status(200).send({ data: { sessionId } })
  })

  // GET /records — ADMIN+FACULTY, networkId in query
  fastify.get('/records', {
    preHandler: [requireAuth, requireRole('query', ['ADMIN', 'FACULTY'])],
  }, async (req, reply) => {
    const parsed = ListRecordsQuerySchema.parse(req.query)
    const result = await listRecords(parsed)
    return reply.status(200).send(result)
  })

  // GET /records/:entryNumber — ADMIN+FACULTY
  fastify.get('/records/:entryNumber', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { entryNumber } = req.params as { entryNumber: string }
    const record = await getRecord(entryNumber, req.user.userId)
    return reply.status(200).send({ data: record })
  })

  // POST /campaigns — ADMIN only, networkId in body
  fastify.post('/campaigns', {
    preHandler: [requireAuth, requireRole('body', ['ADMIN'])],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const parsed = CreateCampaignSchema.parse(req.body)
    const campaign = await createCampaign(parsed, req.user.userId)
    return reply.status(201).send({ data: campaign })
  })

  // GET /campaigns — ADMIN+FACULTY, networkId in query
  fastify.get('/campaigns', {
    preHandler: [requireAuth, requireRole('query', ['ADMIN', 'FACULTY'])],
  }, async (req, reply) => {
    const { networkId, limit } = req.query as { networkId: string; limit?: number }
    const campaigns = await listCampaigns(networkId, limit)
    return reply.status(200).send({ data: campaigns })
  })

  // GET /campaigns/:campaignId — ADMIN+FACULTY
  fastify.get('/campaigns/:campaignId', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { campaignId } = req.params as { campaignId: string }
    const campaign = await getCampaign(campaignId, req.user.userId)
    return reply.status(200).send({ data: campaign })
  })

  // POST /campaigns/:campaignId/send — ADMIN only
  fastify.post('/campaigns/:campaignId/send', {
    preHandler: [requireAuth],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const { campaignId } = req.params as { campaignId: string }
    await triggerCampaignSend(campaignId, req.user.userId)
    return reply.status(202).send()
  })
}
