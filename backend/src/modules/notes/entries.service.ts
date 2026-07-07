import { prisma } from "../../config/database";
import { NotFoundError, ValidationError, ForbiddenError } from "../../common/errors/app-error";
import { logAuditEvent } from "../../services/audit.service";

export async function listNotes(meetingId: string, userId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true, organizationId: true },
  });
  if (!meeting) throw new NotFoundError("Meeting");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { operationalRole: true },
  });

  const isOrganizer = meeting.organizerId === userId;
  const isSecretary = user?.operationalRole === "SECRETARY";

  if (!isOrganizer && !isSecretary) {
    const [attendee, speakerItem] = await Promise.all([
      prisma.meetingAttendee.findUnique({
        where: { meetingId_userId: { meetingId, userId } },
      }),
      prisma.agendaItem.findFirst({
        where: { meetingId, speakers: { some: { userId } } },
      }),
    ]);
    if (!attendee && !speakerItem) {
      throw new ForbiddenError("You do not have access to notes for this meeting");
    }
  }

  return prisma.meetingNote.findMany({
    where: {
      meetingId,
      ...(isOrganizer || isSecretary ? {} : { authorId: userId }),
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function createNote(
  meetingId: string,
  userId: string,
  data: { content?: string }
) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, organizationId: true },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status !== "IN_PROGRESS") {
    throw new ValidationError("Notes can only be added during a live meeting");
  }

  const [attendee, speakerItems] = await Promise.all([
    prisma.meetingAttendee.findUnique({
      where: { meetingId_userId: { meetingId, userId } },
    }),
    prisma.agendaItem.findFirst({
      where: { meetingId, speakers: { some: { userId } } },
    }),
  ]);
  if (!attendee && !speakerItems) {
    throw new ForbiddenError("Only attendees and assigned speakers can add notes");
  }

  const existing = await prisma.meetingNote.findUnique({
    where: { meetingId_authorId: { meetingId, authorId: userId } },
  });
  if (existing) {
    throw new ValidationError("You have already submitted a note for this meeting");
  }

  const note = await prisma.meetingNote.create({
    data: {
      meetingId,
      authorId: userId,
      content: data.content,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  await logAuditEvent({
    organizationId: meeting.organizationId,
    meetingId,
    action: "note_added",
    actorId: userId,
    entityType: "meeting_note",
    entityId: note.id,
  });

  return note;
}

export async function deleteEntry(_id: string) {
  throw new ValidationError("Notes cannot be deleted after submission");
}
