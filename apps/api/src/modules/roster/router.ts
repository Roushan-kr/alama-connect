import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { requireAuth } from '@/middleware/requireAuth.js'
import { requireRole } from '@/middleware/requireRole.js'
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
} from './schemas.js'

export const rosterRouter: FastifyPluginAsync = async (fastify) => {
  // POST /upload — ADMIN only, networkId in body
  fastify.post('/upload', {
    preHandler: [requireAuth, requireRole('body', ['ADMIN'])],
  }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
    const file = await req.file()
    if (!file) {
      return reply.status(400).send({ error: 'Excel file is required', code: 'VALIDATION_ERROR' })
    }
    const buffer = await file.toBuffer()
    const { networkId } = req.body as { networkId: string }
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
