/**
 * src/socket/index.ts
 */

import { Server, Socket } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { jwtVerify } from "jose"
import { env } from "../config/env.js"
import { logger } from "../config/logger.js"
import { db } from "../config/db.js"
import { redis, createSubscriber } from "../config/redis.js"

const secret = new TextEncoder().encode(env.JWT_SECRET)

export let io: Server | null = null

export async function initSocket(server: any) {
  io = new Server(server, {
    cors: {
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
    },
  })

  // Setup Redis adapter for scaling
  try {
    const pubClient = redis
    const subClient = createSubscriber()
    io.adapter(createAdapter(pubClient, subClient))
    logger.info("[Socket.IO] Redis adapter configured successfully")
  } catch (err) {
    logger.error({ err }, "[Socket.IO] Failed to configure Redis adapter")
  }

  // Middleware: Validate JWT handshake
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth
      let token = auth?.token

      // Fallback to query param
      if (!token) {
        token = socket.handshake.query?.token
      }

      if (!token || typeof token !== "string") {
        return next(new Error("Authentication error: missing token"))
      }

      const { payload } = await jwtVerify(token, secret)
      if (!payload.sub) {
        return next(new Error("Authentication error: invalid token subject"))
      }

      socket.data = {
        userId: payload.sub,
        email: payload["email"],
        username: payload["username"],
      }

      next()
    } catch (err) {
      logger.warn({ err }, "[Socket.IO] connection authentication failed")
      next(new Error("Authentication error: invalid token"))
    }
  })

  io.on("connection", async (socket: Socket) => {
    const userId = socket.data.userId
    logger.info({ userId, socketId: socket.id }, "[Socket.IO] user connected")

    // Join user's individual notification room
    socket.join(`user:${userId}`)

    // Join all conversation rooms user belongs to (directly querying the DB as per instructions)
    try {
      const memberships = await db.conversationMember.findMany({
        where: { userId },
        select: { convId: true },
      })

      for (const member of memberships) {
        socket.join(`conv:${member.convId}`)
        logger.debug({ userId, convId: member.convId }, "[Socket.IO] joined conversation room")
      }
    } catch (err) {
      logger.error(
        { err, userId },
        "[Socket.IO] Failed to load conversation memberships on connect",
      )
    }

    // Presence: Join network rooms and broadcast online presence
    let networks: { networkId: string }[] = []
    try {
      networks = await db.networkMember.findMany({
        where: { userId, status: "VERIFIED" },
        select: { networkId: true },
      })

      for (const net of networks) {
        socket.join(`network:${net.networkId}`)
      }

      const wasOnline = await redis.get(`presence:${userId}:online`)
      await redis.set(`presence:${userId}:online`, "1", "EX", 35)

      if (!wasOnline) {
        for (const net of networks) {
          socket.to(`network:${net.networkId}`).emit("presence:online", { userId })
        }
      }
    } catch (err) {
      logger.error({ err, userId }, "[Socket.IO] Failed to update presence on connection")
    }

    // Heartbeat ping listener
    socket.on("ping", async () => {
      try {
        await redis.set(`presence:${userId}:online`, "1", "EX", 35)
        socket.emit("pong")
      } catch (err) {
        logger.error({ err, userId }, "[Socket.IO] Error renewing presence heartbeat")
      }
    })

    socket.on("disconnect", async () => {
      logger.info({ userId, socketId: socket.id }, "[Socket.IO] user disconnected")

      if (!io) return
      try {
        // Check if user has other active connections in their user room
        const sockets = await io.in(`user:${userId}`).fetchSockets()
        if (sockets.length === 0) {
          await redis.del(`presence:${userId}:online`)
          for (const net of networks) {
            io.to(`network:${net.networkId}`).emit("presence:offline", { userId })
          }
        }
      } catch (err) {
        logger.error({ err, userId }, "[Socket.IO] Error processing presence disconnect")
      }
    })
  })

  // Setup generic notification listener via Redis subscriber pattern
  try {
    const redisNotifSubscriber = createSubscriber()
    await redisNotifSubscriber.psubscribe("user:*:notif")

    redisNotifSubscriber.on("pmessage", (pattern, channel, message) => {
      const match = channel.match(/^user:([^:]+):notif$/)
      if (match && io) {
        const targetUserId = match[1]
        const payload = JSON.parse(message)
        io.to(`user:${targetUserId}`).emit("notification", payload)
      }
    })

    logger.info("[Socket.IO] Redis notification subscriber activated")
  } catch (err) {
    logger.error({ err }, "[Socket.IO] Failed to setup Redis notification subscriber")
  }

  return io
}

/** Broadcasts message to room */
export function emitToRoom(room: string, event: string, payload: any) {
  if (io) {
    io.to(room).emit(event, payload)
  }
}
