import { prisma } from "../../config/database";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";

export async function createJoinRequest(meetingId: string, requesterId: string) {
  const existing = await prisma.meetingJoinRequest.findUnique({
    where: { meetingId_requesterId: { meetingId, requesterId } },
  });
  if (existing && existing.status === "PENDING") throw new ValidationError("Duplicate pending request");
  if (existing && existing.status === "APPROVED") throw new ValidationError("Already a participant");

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true, organizationId: true },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status !== "IN_PROGRESS") throw new ValidationError("Can only request to join a live meeting");

  const user = await prisma.user.findUnique({ where: { id: requesterId }, select: { organizationId: true } });
  if (!user || user.organizationId !== meeting.organizationId) throw new ValidationError("Cannot join a meeting from another organization");

  return prisma.meetingJoinRequest.upsert({
    where: { meetingId_requesterId: { meetingId, requesterId } },
    create: { meetingId, requesterId },
    update: { status: "PENDING", reviewedById: null, reviewedAt: null },
  });
}

export async function reviewJoinRequest(id: string, meetingId: string, status: "APPROVED" | "DECLINED", reviewedById: string) {
  const request = await prisma.meetingJoinRequest.findUnique({ where: { id } });
  if (!request || request.meetingId !== meetingId) throw new NotFoundError("MeetingJoinRequest");
  if (request.status !== "PENDING") throw new ValidationError("Request already reviewed");

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status === "COMPLETED_LOCKED") {
    throw new ValidationError("Cannot review join requests on a locked meeting");
  }
  if (meeting.status !== "IN_PROGRESS") {
    throw new ValidationError("Join requests can only be reviewed during a live meeting");
  }

  const updated = await prisma.meetingJoinRequest.update({
    where: { id },
    data: { status, reviewedById, reviewedAt: new Date() },
  });

  if (status === "APPROVED") {
    await prisma.meetingAttendee.upsert({
      where: { meetingId_userId: { meetingId: request.meetingId, userId: request.requesterId } },
      create: { meetingId: request.meetingId, userId: request.requesterId },
      update: {},
    });
  }

  return updated;
}
