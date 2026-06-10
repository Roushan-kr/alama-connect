/**
 * src/modules/messaging/service.ts
 */

import { db } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import { emitToRoom } from "../../socket/index.js";
import { createInAppNotification } from "../../tasks/notification.tasks.js";

export async function getOrCreateConversation(userA: string, userB: string) {
  // Enforce connections verification
  const connection = await db.connection.findFirst({
    where: {
      OR: [
        { userA, userB },
        { userA: userB, userB: userA },
      ],
    },
  });

  if (!connection) {
    throw new Error("Unauthorized: you must be mutually connected to start a conversation");
  }

  // Safe findFirst inside transaction to prevent duplicate insertions from simultaneous calls
  return await db.$transaction(async (tx) => {
    const existing = await tx.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: userA } } },
          { members: { some: { userId: userB } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                userId: true,
                username: true,
                profile: {
                  select: {
                    fullName: true,
                    profileImage: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (existing) {
      return existing;
    }

    // Create new conversation
    const conv = await tx.conversation.create({
      data: {
        isGroup: false,
      },
    });

    // Create members
    await tx.conversationMember.createMany({
      data: [
        { convId: conv.convId, userId: userA },
        { convId: conv.convId, userId: userB },
      ],
    });

    const fullConv = await tx.conversation.findUnique({
      where: { convId: conv.convId },
      include: {
        members: {
          include: {
            user: {
              select: {
                userId: true,
                username: true,
                profile: {
                  select: {
                    fullName: true,
                    profileImage: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!fullConv) {
      throw new Error("Failed to create conversation");
    }

    return fullConv;
  });
}

export async function sendMessage(convId: string, senderId: string, body: string) {
  // Verify sender is in this conversation
  const isMember = await db.conversationMember.findUnique({
    where: {
      convId_userId: { convId, userId: senderId },
    },
  });

  if (!isMember) {
    throw new Error("Unauthorized: you are not a member of this conversation");
  }

  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days

  const message = await db.message.create({
    data: {
      convId,
      senderId,
      body,
      sentAt,
      expiresAt,
    },
    include: {
      sender: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
    },
  });

  // 1. Emit Socket.IO event to room
  emitToRoom(`conv:${convId}`, "new_message", message);

  // 2. Invalidate caches for all members
  const members = await db.conversationMember.findMany({
    where: { convId },
    select: { userId: true },
  });

  for (const m of members) {
    await redis.del(`conv:list:${m.userId}`);
  }

  // 3. Fire-and-forget notification task if offline recipient
  const recipients = members.filter((m) => m.userId !== senderId);
  for (const recipient of recipients) {
    const isOnline = await redis.get(`presence:${recipient.userId}:online`);
    if (!isOnline) {
      await createInAppNotification.trigger({
        userId: recipient.userId,
        type: "NEW_MESSAGE",
        relatedId: message.msgId,
        message: `New message from ${message.sender.profile?.fullName || message.sender.username}`,
        link: `/messages`,
      });
    }
  }

  return message;
}

export async function listMessages(
  convId: string,
  userId: string,
  cursor?: string,
  cursorId?: string,
  limit = 30
) {
  // Verify membership
  const isMember = await db.conversationMember.findUnique({
    where: {
      convId_userId: { convId, userId },
    },
  });

  if (!isMember) {
    throw new Error("Unauthorized to access this conversation");
  }

  const where: any = {
    convId,
    isDeleted: false,
  };

  if (cursor && cursorId) {
    where.AND = [
      {
        OR: [
          { sentAt: { lt: new Date(cursor) } },
          {
            sentAt: new Date(cursor),
            msgId: { lt: cursorId },
          },
        ],
      },
    ];
  }

  const messages = await db.message.findMany({
    where,
    take: limit + 1,
    orderBy: [
      { sentAt: "desc" },
      { msgId: "desc" },
    ],
    include: {
      sender: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              profileImage: true,
            },
          },
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  const data = hasMore ? messages.slice(0, limit) : messages;

  let nextCursor: string | null = null;
  let nextCursorId: string | null = null;

  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1];
    if (lastItem) {
      nextCursor = lastItem.sentAt.toISOString();
      nextCursorId = lastItem.msgId;
    }
  }

  // Reverse list to deliver oldest first for UI scrolling down
  return {
    data: data.reverse(),
    meta: {
      nextCursor,
      nextCursorId,
      hasMore,
      limit,
    },
  };
}

export async function listConversations(userId: string) {
  const cacheKey = `conv:list:${userId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const convs = await db.conversation.findMany({
    where: {
      members: { some: { userId } },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              userId: true,
              username: true,
              profile: {
                select: {
                  fullName: true,
                  profileImage: true,
                },
              },
            },
          },
        },
      },
      messages: {
        where: { isDeleted: false },
        orderBy: { sentAt: "desc" },
        take: 1,
        include: {
          sender: {
            select: {
              userId: true,
              username: true,
            },
          },
        },
      },
    },
  });

  const data = await Promise.all(
    convs.map(async (c) => {
      const unreadCount = await db.message.count({
        where: {
          convId: c.convId,
          senderId: { not: userId },
          isDeleted: false,
          reads: {
            none: { userId },
          },
        },
      });

      return {
        convId: c.convId,
        isGroup: c.isGroup,
        createdAt: c.createdAt,
        members: c.members,
        latestMessage: c.messages[0] || null,
        unreadCount,
      };
    })
  );

  // Cache with 60s +/- jitter TTL
  const jitter = Math.floor(Math.random() * 12) - 6;
  const ttl = Math.max(10, 60 + jitter);
  await redis.set(cacheKey, JSON.stringify(data), "EX", ttl);

  return data;
}

export async function markRead(convId: string, userId: string, upToMsgId: string) {
  const targetMsg = await db.message.findUnique({
    where: { msgId: upToMsgId },
  });

  if (!targetMsg) {
    throw new Error("Message not found");
  }

  const messagesToRead = await db.message.findMany({
    where: {
      convId,
      sentAt: { lte: targetMsg.sentAt },
      senderId: { not: userId },
      isDeleted: false,
      reads: {
        none: { userId },
      },
    },
    select: { msgId: true },
  });

  if (messagesToRead.length > 0) {
    await db.messageRead.createMany({
      data: messagesToRead.map((m) => ({
        msgId: m.msgId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  // Invalidate conversation cache
  await redis.del(`conv:list:${userId}`);

  return { success: true };
}
