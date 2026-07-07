import { ForbiddenError } from "../common/errors/app-error";
import { prisma } from "../config/database";
import type { PolicyUser } from "./access-policy";
import { isSecretary, isTeamAdmin } from "./access-policy";

export async function isMeetingOrganizer(meetingId: string, userId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true },
  });
  return meeting?.organizerId === userId;
}

export async function canViewMeeting(meetingId: string, userId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { createdById: true, organizationId: true, ownerTeamId: true, executiveRequestId: true },
  });
  if (!meeting) return false;

  const [user, attendee, speakerItem, executiveRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, operationalRole: true, isExecutive: true, organizationId: true, functionalTeamId: true },
    }),
    prisma.meetingAttendee.findFirst({ where: { meetingId, userId, removedAt: null } }),
    prisma.agendaItem.findFirst({ where: { meetingId, speakers: { some: { userId } } } }),
    meeting.executiveRequestId
      ? prisma.executiveRequest.findUnique({ where: { id: meeting.executiveRequestId }, select: { createdByExecutiveId: true } })
      : Promise.resolve(null),
  ]);
  if (!user) return false;

  if (!!attendee || !!speakerItem) return true;

  if (meeting.createdById === userId && !user.isExecutive) return true;

  if (user.isExecutive && executiveRequest?.createdByExecutiveId === userId) return true;

  if (isSecretary(user) && user.organizationId === meeting.organizationId) return true;

  if (isTeamAdmin(user) && meeting.ownerTeamId && user.functionalTeamId === meeting.ownerTeamId) return true;

  return false;
}

export async function requireCanViewMeeting(meetingId: string, userId: string): Promise<void> {
  if (!(await canViewMeeting(meetingId, userId))) {
    throw new ForbiddenError("You do not have access to this meeting");
  }
}
