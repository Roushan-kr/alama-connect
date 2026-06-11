/**
 * src/middleware/requireRole.ts
 *
 * Fastify preHandler hook factory for network-scoped role enforcement.
 *
 * Usage:
 *   fastify.post('/api/admin/verify', {
 *     preHandler: [requireAuth, requireRole('networkId-param-name', ['ADMIN', 'FACULTY'])],
 *   }, handler)
 *
 * The networkId is read from request.params[networkIdParam] or request.body.networkId.
 */

import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../config/db.js";

/** Network roles — mirrors the Prisma NetworkRole enum. */
type NetworkRole = "STUDENT" | "ALUMNI" | "FACULTY" | "ADMIN";

/**
 * Creates a preHandler that verifies the authenticated user holds
 * one of the required roles in the specified network.
 *
 * @param networkIdSource - Where to find the networkId:
 *   - "param:<paramName>"   — from request.params (e.g. "param:networkId")
 *   - "body"                — from request.body.networkId
 *   - "query"               — from request.query.networkId
 *   - "<fixed-uuid>"        — a literal UUID string (useful for admin-only guards)
 * @param roles - Required network roles (any match passes)
 */
export function requireRole(
  networkIdSource: string,
  roles: NetworkRole[],
) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (request.user?.globalRole === "SUPER_ADMIN") {
      return;
    }

    if (!request.user) {
      return reply.status(401).send({
        error: "Authentication required",
        code: "UNAUTHORIZED",
      });
    }

    // Resolve the networkId from the specified source.
    let networkId: string | undefined;

    if (networkIdSource.startsWith("param:")) {
      const paramName = networkIdSource.slice(6);
      networkId = (request.params as Record<string, string>)[paramName];
    } else if (networkIdSource === "body") {
      networkId = (request.body as Record<string, string> | undefined)
        ?.networkId;
    } else if (networkIdSource === "query") {
      networkId = (request.query as Record<string, string>)?.networkId;
    } else {
      // Treat as a literal networkId UUID.
      networkId = networkIdSource;
    }

    if (!networkId) {
      return reply.status(400).send({
        error: "Network ID is required for this operation",
        code: "MISSING_NETWORK_ID",
      });
    }

    const membership = await db.networkMember.findUnique({
      where: {
        userId_networkId: {
          userId: request.user.userId,
          networkId,
        },
      },
      select: { role: true, status: true },
    });

    if (!membership) {
      return reply.status(403).send({
        error: "You are not a member of this network",
        code: "FORBIDDEN",
      });
    }

    if (membership.status !== "VERIFIED") {
      return reply.status(403).send({
        error: "Your membership in this network is not yet verified",
        code: "MEMBERSHIP_NOT_VERIFIED",
      });
    }

    if (!roles.includes(membership.role as NetworkRole)) {
      return reply.status(403).send({
        error: `This action requires one of the following roles: ${roles.join(", ")}`,
        code: "INSUFFICIENT_ROLE",
      });
    }
  };
}

/**
 * Shorthand: require ADMIN role in the network specified by a route param.
 * @param paramName - Route param holding the networkId (default: "networkId")
 */
export function requireAdmin(paramName = "networkId") {
  return requireRole(`param:${paramName}`, ["ADMIN"]);
}

/**
 * Shorthand: require ADMIN or FACULTY in the body-provided networkId.
 */
export function requireAdminOrFaculty() {
  return requireRole("body", ["ADMIN", "FACULTY"]);
}

/**
 * Asserts that the calling user is an ADMIN of the specified network.
 * Bypasses checks for SUPER_ADMINs.
 * Throws a Fastify-compatible 403 error on failure.
 */
export async function assertNetworkAdmin(
  userId: string,
  networkId: string,
  globalRole?: string,
): Promise<void> {
  if (globalRole === "SUPER_ADMIN") return;

  const membership = await db.networkMember.findUnique({
    where: {
      userId_networkId: {
        userId,
        networkId,
      },
    },
    select: { role: true, status: true },
  });

  if (
    !membership ||
    membership.status !== "VERIFIED" ||
    membership.role !== "ADMIN"
  ) {
    throw Object.assign(new Error("Access restricted to network administrators"), {
      statusCode: 403,
      code: "FORBIDDEN",
    });
  }
}

