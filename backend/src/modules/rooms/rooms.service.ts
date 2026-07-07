import { prisma } from "../../config/database";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { logAuditEvent } from "../../services/audit.service";

export async function listRooms(organizationId: string) {
  return prisma.room.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function getRoomById(id: string) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room || !room.isActive) throw new NotFoundError("Room");
  return room;
}

export async function createRoom(organizationId: string, name: string, actorId: string) {
  const normalized = name.trim();
  const room = await prisma.room.create({ data: { name: normalized, organizationId } });
  await logAuditEvent({
    organizationId,
    action: "room_created",
    actorId,
    entityType: "room",
    entityId: room.id,
    details: { name: normalized },
  });
  return room;
}

export async function updateRoom(id: string, data: { name?: string; isActive?: boolean }, actorId: string) {
  const room = await prisma.room.findUnique({ where: { id }, include: { organization: { select: { id: true } } } });
  if (!room || !room.isActive) throw new NotFoundError("Room");

  if (data.name && data.name.trim()) {
    data.name = data.name.trim();
  }

  const updated = await prisma.room.update({ where: { id }, data });
  await logAuditEvent({
    organizationId: room.organizationId,
    action: "room_updated",
    actorId,
    entityType: "room",
    entityId: id,
    details: { before: { name: room.name, isActive: room.isActive }, after: data },
  });
  return updated;
}

export async function deactivateRoom(id: string, actorId: string) {
  const room = await prisma.room.findUnique({ where: { id }, include: { organization: { select: { id: true } } } });
  if (!room) throw new NotFoundError("Room");
  if (!room.isActive) throw new NotFoundError("Room");

  const activeBookings = await prisma.roomBooking.count({
    where: {
      roomId: id,
      meeting: {
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
    },
  });
  if (activeBookings > 0) {
    throw new ValidationError(
      `Cannot deactivate room with ${activeBookings} active booking(s) (Scheduled or InProgress). Reschedule or cancel them first.`,
    );
  }

  await prisma.room.update({ where: { id }, data: { isActive: false, deactivatedAt: new Date() } });
  await logAuditEvent({
    organizationId: room.organizationId,
    action: "room_deactivated",
    actorId,
    entityType: "room",
    entityId: id,
    details: { name: room.name },
  });
}

export const deleteRoom = deactivateRoom;

export async function checkRoomConflict(roomId: string, start: Date, durationSeconds: number, excludeMeetingId?: string) {
  const startTime = start.getTime();
  const endTime = startTime + durationSeconds * 1000;

  const bookings = await prisma.roomBooking.findMany({
    where: {
      roomId,
      ...(excludeMeetingId ? { meetingId: { not: excludeMeetingId } } : {}),
    },
    select: {
      id: true,
      meetingId: true,
      startsAt: true,
      endsAt: true,
      meeting: { select: { title: true } },
    },
  });

  return bookings.filter((b) => {
    const bStart = b.startsAt.getTime();
    const bEnd = b.endsAt.getTime();
    return startTime < bEnd && endTime > bStart;
  }).map((b) => ({
    id: b.meetingId,
    title: b.meeting.title,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
  }));
}
