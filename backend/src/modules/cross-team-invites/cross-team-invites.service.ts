import { prisma } from "../../config/database";
import { NotFoundError, ValidationError } from "../../common/errors/app-error";

export async function createInvite(data: {
  meetingId: string;
  invitedUserId: string;
  invitedFromTeamId: string;
  requestedById: string;
}) {
  const existing = await prisma.crossTeamInvite.findUnique({
    where: { meetingId_invitedUserId: { meetingId: data.meetingId, invitedUserId: data.invitedUserId } },
  });
  if (existing) throw new ValidationError("Invite already exists for this user in this meeting");

  return prisma.crossTeamInvite.create({
    data: {
      meetingId: data.meetingId,
      invitedUserId: data.invitedUserId,
      invitedFromTeamId: data.invitedFromTeamId,
      requestedById: data.requestedById,
    },
    include: {
      invitedUser: { select: { id: true, name: true, email: true } },
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      meeting: { select: { id: true, title: true } },
    },
  });
}

export async function reviewInvite(id: string, status: "APPROVED" | "DECLINED", reviewedById: string) {
  const invite = await prisma.crossTeamInvite.findUnique({ where: { id } });
  if (!invite) throw new NotFoundError("CrossTeamInvite");
  if (invite.status !== "PENDING") throw new ValidationError("Invite is already reviewed");

  const updated = await prisma.crossTeamInvite.update({
    where: { id },
    data: { status, reviewedById, reviewedAt: new Date() },
  });

  if (status === "APPROVED") {
    await prisma.meetingAttendee.upsert({
      where: { meetingId_userId: { meetingId: invite.meetingId, userId: invite.invitedUserId } },
      create: { meetingId: invite.meetingId, userId: invite.invitedUserId, role: "attendee" },
      update: {},
    });
  }

  return updated;
}

export async function getInvitesForMeeting(meetingId: string) {
  return prisma.crossTeamInvite.findMany({
    where: { meetingId },
    include: {
      invitedUser: { select: { id: true, name: true, email: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });
}
