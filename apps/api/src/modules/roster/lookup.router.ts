import type { FastifyPluginAsync } from 'fastify'
import { db } from '../../config/db.js'
import { redis } from '../../config/redis.js'
import { jitteredTtl } from '../../lib/cache.js'
import { normalizeEntryNumber } from '../../lib/entry-number.js'
import { jwtVerify } from 'jose'
import { env } from '../../config/env.js'
import { z } from 'zod'

const LookupQuerySchema = z.object({
  entryNumber: z.string().min(1),
  networkId: z.uuid(),
})

const secret = new TextEncoder().encode(env.JWT_SECRET)

export const rosterLookupRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get('/lookup', async (req, reply) => {
    const parsed = LookupQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid entry number or network ID format',
        code: 'VALIDATION_ERROR',
        details: parsed.error.format(),
      })
    }

    const { entryNumber, networkId } = parsed.data

    // Determine rate limit identifier: authenticated user ID or client IP
    let identifier = req.ip
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      try {
        const { payload } = await jwtVerify(token, secret)
        if (typeof payload.sub === 'string') {
          identifier = payload.sub
        }
      } catch (err) {
        // Fall back to IP rate limiting on token verify failures
      }
    }

    const rateLimitKey = `rl:roster:lookup:${identifier}`
    const count = await redis.incr(rateLimitKey)
    if (count === 1) {
      const ttl = jitteredTtl(3600)
      await redis.expire(rateLimitKey, ttl)
    }

    if (count > 5) {
      return reply.status(429).send({
        error: 'Too many lookup requests. Rate limit exceeded (5/hour).',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    }

    const normalized = normalizeEntryNumber(entryNumber)

    // Lookup active non-removed RosterRecord. Expose safe whitelist ONLY
    const record = await db.rosterRecord.findFirst({
      where: {
        entryNumber: normalized,
        networkId,
        removedFromRoster: false,
      },
      select: {
        entryNumber: true,
        fullName: true,
        branch: true,
        batch: true,
        role: true,
      },
    })

    if (!record) {
      return reply.status(404).send({
        error: 'No matching roster record found',
        code: 'RECORD_NOT_FOUND',
      })
    }

    return reply.status(200).send({ data: record })
  })
}
