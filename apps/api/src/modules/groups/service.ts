/**
 * src/modules/groups/service.ts
 */

import { db } from "../../config/db.js";
import type { CreateGroupInput, UpdateGroupInput } from "./schemas.js";
import { GroupRole } from "@prisma/client";

export async function createGroup(
  userId: string,
  networkId: string,
  data: CreateGroupInput
) {
  return await db.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        networkId,
        name: data.name,
        description: data.description || null,
        isPrivate: data.isPrivate,
        createdBy: userId,
      },
    });

    await tx.groupMember.create({
      data: {
        groupId: group.groupId,
        userId,
        role: GroupRole.ADMIN,
      },
    });

    return group;
  });
}

export async function listGroups(networkId: string, userId: string) {
  // Find all groups the user is currently a member of.
  const userMemberships = await db.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  const memberGroupIds = userMemberships.map((m) => m.groupId);

  // Return all groups matching networkId where:
  // - the group is public OR user is a member of the group.
  return await db.group.findMany({
    where: {
      networkId,
      OR: [
        { isPrivate: false },
        { groupId: { in: memberGroupIds } },
      ],
    },
    include: {
      _count: {
        select: { members: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getGroup(groupId: string, userId: string) {
  const group = await db.group.findUnique({
    where: { groupId },
    include: {
      _count: {
        select: { members: true },
      },
      members: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!group) {
    throw new Error("Group not found");
  }

  const isMember = group.members.length > 0;

  if (group.isPrivate && !isMember) {
    throw new Error("Unauthorized: private group access denied");
  }

  return {
    ...group,
    role: isMember && group.members[0] ? group.members[0].role : null,
  };
}

export async function joinGroup(groupId: string, userId: string) {
  const group = await db.group.findUnique({
    where: { groupId },
    select: { isPrivate: true },
  });

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.isPrivate) {
    throw new Error("Unauthorized: private groups require an invitation to join");
  }

  // Check if already a member
  const exists = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
  });

  if (exists) {
    return exists;
  }

  return await db.groupMember.create({
    data: {
      groupId,
      userId,
      role: GroupRole.MEMBER,
    },
  });
}

export async function inviteMember(
  groupId: string,
  inviterId: string,
  targetUserId: string
) {
  // Inviter must be ADMIN or MODERATOR in the group.
  const inviter = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: inviterId },
    },
    select: { role: true },
  });

  if (!inviter || (inviter.role !== GroupRole.ADMIN && inviter.role !== GroupRole.MODERATOR)) {
    throw new Error("Unauthorized to invite members to this group");
  }

  // Check if target is already a member
  const exists = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
  });

  if (exists) {
    return exists;
  }

  return await db.groupMember.create({
    data: {
      groupId,
      userId: targetUserId,
      role: GroupRole.MEMBER,
    },
  });
}

export async function removeMember(
  groupId: string,
  actorId: string,
  targetUserId: string
) {
  // Actor must be ADMIN in the group
  const actor = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId: actorId },
    },
    select: { role: true },
  });

  if (!actor || actor.role !== GroupRole.ADMIN) {
    throw new Error("Unauthorized: only group admins can remove members");
  }

  // Creator can't be removed unless the group is deleted
  const group = await db.group.findUnique({
    where: { groupId },
    select: { createdBy: true },
  });

  if (group && group.createdBy === targetUserId) {
    throw new Error("Cannot remove the creator/primary admin of the group");
  }

  return await db.groupMember.delete({
    where: {
      groupId_userId: { groupId, userId: targetUserId },
    },
  });
}

export async function updateGroup(
  groupId: string,
  userId: string,
  data: UpdateGroupInput
) {
  // User must be ADMIN in the group
  const member = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
    select: { role: true },
  });

  if (!member || member.role !== GroupRole.ADMIN) {
    throw new Error("Unauthorized to update group details");
  }

  const updatePayload: any = {};
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.isPrivate !== undefined) updatePayload.isPrivate = data.isPrivate;

  return await db.group.update({
    where: { groupId },
    data: updatePayload,
  });
}

export async function deleteGroup(groupId: string, userId: string) {
  // User must be ADMIN in the group
  const member = await db.groupMember.findUnique({
    where: {
      groupId_userId: { groupId, userId },
    },
    select: { role: true },
  });

  if (!member || member.role !== GroupRole.ADMIN) {
    throw new Error("Unauthorized to delete this group");
  }

  return await db.group.delete({
    where: { groupId },
  });
}
