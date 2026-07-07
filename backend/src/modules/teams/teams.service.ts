import { prisma } from "../../config/database";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { logAuditEvent } from "../../services/audit.service";

function isActive(team: { isActive: boolean }): boolean {
  return team.isActive;
}

export async function listTeams(organizationId: string) {
  return prisma.functionalTeam.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: "asc" },
    include: { members: { select: { id: true, name: true } } },
  });
}

export async function getTeam(id: string) {
  const team = await prisma.functionalTeam.findUnique({
    where: { id },
    include: { members: { select: { id: true, name: true, email: true, operationalRole: true, isExecutive: true } } },
  });
  if (!team || !isActive(team)) throw new NotFoundError("Team");
  return team;
}

export async function createTeam(organizationId: string, name: string, actorId: string) {
  const team = await prisma.functionalTeam.create({ data: { name, organizationId } });
  await logAuditEvent({
    organizationId,
    action: "team_created",
    actorId,
    entityType: "team",
    entityId: team.id,
    details: { name },
  });
  return team;
}

export async function updateTeam(id: string, data: { name?: string }, actorId: string) {
  const team = await prisma.functionalTeam.findUnique({ where: { id }, include: { members: { select: { id: true } } } });
  if (!team || !isActive(team)) throw new NotFoundError("Team");
  const oldName = team.name;
  if (data.name && data.name.trim()) {
    data.name = data.name.trim();
  }
  const updated = await prisma.functionalTeam.update({ where: { id }, data });
  if (data.name && data.name !== oldName) {
    await logAuditEvent({
      organizationId: team.organizationId,
      action: "team_updated",
      actorId,
      entityType: "team",
      entityId: id,
      details: { oldName, newName: data.name },
    });
  }
  return updated;
}

export async function deleteTeam(id: string, actorId: string) {
  const team = await prisma.functionalTeam.findUnique({ where: { id }, include: { members: { select: { id: true } } } });
  if (!team) throw new NotFoundError("Team");
  if (!isActive(team)) throw new NotFoundError("Team");

  const activeMemberCount = team.members.length;
  if (activeMemberCount > 0) {
    throw new ValidationError(`Cannot delete team with ${activeMemberCount} active member(s). Remove all members first.`);
  }

  const [scheduledMeetings, pendingInvites] = await Promise.all([
    prisma.meeting.count({
      where: { ownerTeamId: id, status: { in: ["SCHEDULED", "IN_PROGRESS"] as any } },
    }),
    prisma.crossTeamInvite.count({
      where: { invitedFromTeamId: id, status: "PENDING" },
    }),
  ]);

  if (scheduledMeetings > 0) {
    throw new ValidationError(`Cannot delete team with ${scheduledMeetings} upcoming meeting(s). Cancel or complete them first.`);
  }
  if (pendingInvites > 0) {
    throw new ValidationError(`Cannot delete team with ${pendingInvites} pending cross-team invitation(s). Resolve them first.`);
  }

  await prisma.functionalTeam.update({ where: { id }, data: { isActive: false } });
  await logAuditEvent({
    organizationId: team.organizationId,
    action: "team_deleted",
    actorId,
    entityType: "team",
    entityId: id,
    details: { name: team.name },
  });
}

export async function addTeamMember(teamId: string, userId: string, actorId: string) {
  const [team, user] = await Promise.all([
    prisma.functionalTeam.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!team || !isActive(team)) throw new NotFoundError("Team");
  if (!user || !user.isActive) throw new NotFoundError("User");
  if (user.organizationId !== team.organizationId) {
    throw new ValidationError("Cannot add a user from a different organization");
  }
  if (user.functionalTeamId && user.functionalTeamId !== teamId) {
    throw new ValidationError("User is already assigned to another team");
  }
  if (user.functionalTeamId === teamId) return user;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { functionalTeamId: teamId },
  });
  await logAuditEvent({
    organizationId: team.organizationId,
    action: "team_member_added",
    actorId,
    entityType: "user",
    entityId: userId,
    details: { teamId, teamName: team.name },
  });
  return updated;
}

export async function removeTeamMember(teamId: string, userId: string, actorId: string) {
  const [team, user] = await Promise.all([
    prisma.functionalTeam.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!user) throw new NotFoundError("User");
  if (user.functionalTeamId !== teamId) return user;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { functionalTeamId: null },
  });
  if (team) {
    await logAuditEvent({
      organizationId: team.organizationId,
      action: "team_member_removed",
      actorId,
      entityType: "user",
      entityId: userId,
      details: { teamId, teamName: team.name },
    });
  }
  return updated;
}
