/**
 * src/modules/connections/service.ts
 */

import { db } from "@/config/db.js";
import { createInAppNotification } from "@/tasks/notification.tasks.js";
import { ConnectionStatus } from "@prisma/client";

/**
 * Send a connection request from fromUserId to toUserId.
 */
export async function sendRequest(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    throw new Error("Cannot send a connection request to yourself");
  }

  // Check if they are already connected
  const [userA, userB] = fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];
  const existingConnection = await db.connection.findUnique({
    where: {
      userA_userB: { userA, userB },
    },
  });

  if (existingConnection) {
    throw new Error("You are already connected with this user");
  }

  // Check if there is an existing pending request in either direction
  const existingRequest = await db.connectionRequest.findFirst({
    where: {
      OR: [
        { fromUser: fromUserId, toUser: toUserId, status: ConnectionStatus.PENDING },
        { fromUser: toUserId, toUser: fromUserId, status: ConnectionStatus.PENDING },
      ],
    },
  });

  if (existingRequest) {
    throw new Error("A pending connection request already exists between you and this user");
  }

  // Create the connection request
  const request = await db.connectionRequest.create({
    data: {
      fromUser: fromUserId,
      toUser: toUserId,
      status: ConnectionStatus.PENDING,
    },
  });

  // Get sender details for notification message
  const fromUser = await db.user.findUnique({
    where: { userId: fromUserId },
    include: { profile: true },
  });

  const senderName = fromUser?.profile?.fullName || fromUser?.username || "A user";

  // Trigger notifications
  await createInAppNotification.trigger({
    userId: toUserId,
    type: "CONNECTION_REQUEST",
    relatedId: request.reqId,
    message: `${senderName} sent you a connection request.`,
    link: "/connections",
  });

  return request;
}

/**
 * Respond to a pending connection request (accept or decline).
 */
export async function respondToRequest(userId: string, reqId: string, action: "accept" | "decline") {
  const request = await db.connectionRequest.findUnique({
    where: { reqId },
  });

  if (!request) {
    throw new Error("Connection request not found");
  }

  if (request.toUser !== userId) {
    throw new Error("Unauthorized: You cannot respond to this connection request");
  }

  if (request.status !== ConnectionStatus.PENDING) {
    throw new Error("This connection request has already been processed");
  }

  if (action === "decline") {
    const updatedRequest = await db.connectionRequest.update({
      where: { reqId },
      data: { status: ConnectionStatus.DECLINED },
    });
    return updatedRequest;
  }

  // Action is accept: wrap request status update and connection creation in transaction
  const [userA, userB] =
    request.fromUser < request.toUser
      ? [request.fromUser, request.toUser]
      : [request.toUser, request.fromUser];

  const [updatedRequest, connection] = await db.$transaction([
    db.connectionRequest.update({
      where: { reqId },
      data: { status: ConnectionStatus.ACCEPTED },
    }),
    db.connection.create({
      data: {
        userA,
        userB,
      },
    }),
  ]);

  // Get recipient details for notification
  const toUser = await db.user.findUnique({
    where: { userId: request.toUser },
    include: { profile: true },
  });

  const recipientName = toUser?.profile?.fullName || toUser?.username || "A user";

  // Trigger accepted notification to the sender of the request
  await createInAppNotification.trigger({
    userId: request.fromUser,
    type: "CONNECTION_ACCEPTED",
    relatedId: request.reqId,
    message: `${recipientName} accepted your connection request.`,
    link: "/connections",
  });

  return { request: updatedRequest, connection };
}

/**
 * List connections of a user with keyset pagination.
 */
export async function listConnections(userId: string, limit: number, cursor?: string) {
  const connections = await db.connection.findMany({
    where: {
      OR: [{ userA: userId }, { userB: userId }],
      ...(cursor ? { connectedAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      a: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
      b: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
    },
    orderBy: {
      connectedAt: "desc",
    },
    take: limit + 1, // Take one extra to determine next cursor
  });

  const hasNextPage = connections.length > limit;
  const items = connections.slice(0, limit).map((conn) => {
    const otherUser = conn.userA === userId ? conn.b : conn.a;
    return {
      connectedAt: conn.connectedAt,
      user: otherUser,
    };
  });

  const lastItem = connections[limit - 1]
  const nextCursor = hasNextPage && lastItem ? lastItem.connectedAt.toISOString() : undefined;

  return {
    data: items,
    nextCursor,
  };
}

/**
 * List pending connection requests received by a user.
 */
export async function listPendingRequests(userId: string) {
  const requests = await db.connectionRequest.findMany({
    where: {
      toUser: userId,
      status: ConnectionStatus.PENDING,
    },
    include: {
      from: {
        select: {
          userId: true,
          username: true,
          profile: {
            select: {
              fullName: true,
              headline: true,
              profileImage: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return requests;
}

/**
 * Remove a connection between two users.
 */
export async function removeConnection(userId: string, targetUserId: string) {
  const [userA, userB] = userId < targetUserId ? [userId, targetUserId] : [targetUserId, userId];

  // Check if connection exists
  const connection = await db.connection.findUnique({
    where: {
      userA_userB: { userA, userB },
    },
  });

  if (!connection) {
    throw new Error("No connection exists between you and this user");
  }

  await db.$transaction([
    db.connection.delete({
      where: {
        userA_userB: { userA, userB },
      },
    }),
    db.connectionRequest.deleteMany({
      where: {
        OR: [
          { fromUser: userId, toUser: targetUserId },
          { fromUser: targetUserId, toUser: userId },
        ],
      },
    }),
  ]);

  return { success: true };
}
