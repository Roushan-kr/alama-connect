import type { JwtUser } from "../middleware/requireAuth.js";
import type { GroupMember } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtUser;
    groupMember?: GroupMember;
  }
}
