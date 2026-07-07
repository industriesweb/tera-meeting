import { prisma } from "../../config/database";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";
import { logAuditEvent } from "../../services/audit.service";

const reportInclude = {
  attendees: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  agendaItems: { orderBy: { sortOrder: "asc" as const }, include: { speakers: { include: { user: { select: { id: true, name: true } } } } } },
  notes: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
  },
  timer: true,
  creator: { select: { id: true, name: true, email: true } },
  organizer: { select: { id: true, name: true, email: true } },
  room: true,
  ownerTeam: { select: { id: true, name: true } },
};

export async function getMeetingReport(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: reportInclude,
  });
  if (!meeting) throw new NotFoundError("Meeting");
  return meeting;
}

export async function logMeeting(meetingId: string, userId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      attendees: { include: { user: true } },
      agendaItems: { include: { speakers: true } },
      notes: true,
      timer: true,
    },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status !== "COMPLETED_LOCKED") {
    throw new ValidationError("Only completed meetings can be logged");
  }

  await logAuditEvent({
    organizationId: meeting.organizationId,
    meetingId,
    action: "meeting_logged",
    actorId: userId,
    entityType: "meeting",
    entityId: meetingId,
    details: { title: meeting.title },
  });

  return meeting;
}
