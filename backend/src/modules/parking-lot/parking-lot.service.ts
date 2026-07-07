import { prisma } from "../../config/database";
import { NotFoundError, ValidationError, ForbiddenError } from "../../common/errors/app-error";
import type { ParkingLotStatus } from "@prisma/client";

const itemInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
  sourceMeeting: { select: { id: true, title: true, status: true } },
  agendaMeeting: { select: { id: true, title: true, status: true } },
};

const ALLOWED_APPROVE_TRANSITIONS: ParkingLotStatus[] = ["PENDING_REVIEW"];
const ALLOWED_ARCHIVE_TRANSITIONS: ParkingLotStatus[] = ["PENDING_REVIEW", "APPROVED"];

export async function createItem(data: {
  organizationId: string;
  teamId: string;
  title: string;
  note?: string;
  createdById: string;
  sourceMeetingId?: string;
}) {
  const team = await prisma.functionalTeam.findUnique({ where: { id: data.teamId }, select: { organizationId: true, isActive: true } });
  if (!team || !team.isActive) throw new NotFoundError("Team");
  if (team.organizationId !== data.organizationId) throw new ValidationError("Team does not belong to the same organization");

  if (data.sourceMeetingId) {
    const meeting = await prisma.meeting.findUnique({ where: { id: data.sourceMeetingId }, select: { organizationId: true } });
    if (!meeting || meeting.organizationId !== data.organizationId) {
      throw new ValidationError("Source meeting does not belong to the same organization");
    }
  }

  return prisma.parkingLotItem.create({
    data: {
      organizationId: data.organizationId,
      teamId: data.teamId,
      title: data.title,
      note: data.note,
      createdById: data.createdById,
      sourceMeetingId: data.sourceMeetingId,
    },
    include: itemInclude,
  });
}

export async function listTeamItems(teamId: string, callerId: string) {
  const caller = await prisma.user.findUnique({ where: { id: callerId }, select: { operationalRole: true, functionalTeamId: true, organizationId: true } });
  if (!caller) throw new NotFoundError("User");

  const isOwnTeam = caller.functionalTeamId === teamId;
  const isSecretary = caller.operationalRole === "SECRETARY";

  const items = await prisma.parkingLotItem.findMany({
    where: { teamId },
    include: itemInclude,
    orderBy: { createdAt: "desc" },
  });

  return items.filter((item) => {
    if (isSecretary) return true;
    if (!isOwnTeam) return false;
    if (item.status === "PENDING_REVIEW") return item.createdById === callerId || caller.operationalRole === "TEAM_ADMIN";
    if (item.status === "APPROVED") return true;
    if (item.status === "USED_IN_AGENDA") return true;
    if (item.status === "ARCHIVED") return caller.operationalRole === "TEAM_ADMIN" || item.createdById === callerId;
    return false;
  });
}

export async function getItem(id: string) {
  const item = await prisma.parkingLotItem.findUnique({
    where: { id },
    include: itemInclude,
  });
  if (!item) throw new NotFoundError("ParkingLotItem");
  return item;
}

export async function approveItem(id: string, reviewedById: string) {
  const item = await prisma.parkingLotItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("ParkingLotItem");
  if (!ALLOWED_APPROVE_TRANSITIONS.includes(item.status)) {
    throw new ValidationError(`Cannot approve item in ${item.status} status`);
  }
  return prisma.parkingLotItem.update({
    where: { id },
    data: { status: "APPROVED", reviewedById, reviewedAt: new Date() },
    include: itemInclude,
  });
}

export async function archiveItem(id: string) {
  const item = await prisma.parkingLotItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("ParkingLotItem");
  if (!ALLOWED_ARCHIVE_TRANSITIONS.includes(item.status)) {
    throw new ValidationError(`Cannot archive item in ${item.status} status`);
  }
  return prisma.parkingLotItem.update({
    where: { id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
    include: itemInclude,
  });
}

export async function addToAgenda(id: string, agendaMeetingId: string, callerId: string) {
  const [item, meeting] = await Promise.all([
    prisma.parkingLotItem.findUnique({ where: { id } }),
    prisma.meeting.findUnique({ where: { id: agendaMeetingId }, select: { status: true, organizationId: true, ownerTeamId: true, kind: true } }),
  ]);
  if (!item) throw new NotFoundError("ParkingLotItem");
  if (!meeting) throw new NotFoundError("Meeting");

  if (item.status !== "APPROVED") {
    throw new ValidationError("Only APPROVED items can be added to an agenda");
  }
  if (item.agendaMeetingId !== null) {
    throw new ValidationError("Item is already linked to a meeting agenda");
  }
  if (item.organizationId !== meeting.organizationId) {
    throw new ValidationError("Parking lot item and target meeting must belong to the same organization");
  }
  if (item.teamId !== meeting.ownerTeamId) {
    throw new ValidationError("Parking lot item owner team must match the target meeting owner team");
  }
  if (meeting.kind !== "STRUCTURED") {
    throw new ValidationError("Only STRUCTURED meetings can receive parking lot items");
  }
  if (meeting.status !== "DRAFT" && meeting.status !== "SCHEDULED") {
    throw new ValidationError("Target meeting must be in DRAFT or SCHEDULED status");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.parkingLotItem.update({
      where: { id },
      data: { status: "USED_IN_AGENDA", agendaMeetingId },
      include: itemInclude,
    });

    await tx.auditEvent.create({
      data: {
        organizationId: item.organizationId,
        meetingId: agendaMeetingId,
        actorId: callerId,
        action: "PARKING_LOT_ADDED_TO_AGENDA",
        entityType: "ParkingLotItem",
        entityId: id,
        details: {
          parkingLotItemId: id,
          agendaMeetingId,
          teamId: item.teamId,
        },
      },
    });

    return updated;
  });
}

export async function archivePendingItemsForUser(userId: string) {
  return prisma.parkingLotItem.updateMany({
    where: { createdById: userId, status: "PENDING_REVIEW" },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function archiveOldTeamItemsForUser(userId: string, oldTeamId: string) {
  return prisma.parkingLotItem.updateMany({
    where: { createdById: userId, teamId: oldTeamId, status: { in: ["PENDING_REVIEW", "APPROVED"] } },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}
