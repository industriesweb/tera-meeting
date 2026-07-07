import { prisma } from "../../config/database";
import { NotFoundError, ValidationError, ForbiddenError } from "../../common/errors/app-error";
import type { ExecutiveRequestStatus, ExecutiveRequestTargetType } from "@prisma/client";

const WINDOW_MORNING = { start: 8, end: 12 };   // 08:00–12:00
const WINDOW_AFTERNOON = { start: 13, end: 17 }; // 13:00–17:00

const requestInclude = {
  targets: {
    include: {
      targetUser: {
        select: {
          id: true,
          name: true,
          functionalTeamId: true,
          functionalTeam: { select: { id: true, name: true } },
        },
      },
      targetTeam: { select: { id: true, name: true } },
    },
  },
  currentMeeting: { select: { id: true, title: true, status: true, scheduledAt: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};

export async function listRequests(organizationId: string) {
  return prisma.executiveRequest.findMany({
    where: { organizationId },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function listMyRequests(userId: string) {
  return prisma.executiveRequest.findMany({
    where: { createdByExecutiveId: userId },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function listAssignedRequests(actor: {
  id: string;
  functionalTeamId: string | null;
  operationalRole: string | null;
  organizationId: string;
}) {
  const isAdmin = actor.operationalRole === "TEAM_ADMIN";
  return prisma.executiveRequest.findMany({
    where: {
      organizationId: actor.organizationId,
      targets: {
        some: {
          OR: [
            { targetType: "USER", targetUserId: actor.id },
            ...(isAdmin && actor.functionalTeamId
              ? [{ targetType: "TEAM" as const, targetTeamId: actor.functionalTeamId }]
              : []),
          ],
        },
      },
    },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getRequest(id: string) {
  const req = await prisma.executiveRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!req) throw new NotFoundError("ExecutiveRequest");
  return req;
}

export async function createRequest(data: {
  organizationId: string;
  createdByExecutiveId: string;
  title: string;
  description?: string;
  requestedDate: string;
  preferredPeriod?: string;
  requestedDurationSeconds?: number;
  urgency?: string;
  targets: { targetType: ExecutiveRequestTargetType; targetUserId?: string; targetTeamId?: string }[];
}) {
  if (!data.targets || data.targets.length === 0) {
    throw new ValidationError("Executive request must have at least one target");
  }

  // Validate all targets belong to the same organization
  for (const t of data.targets) {
    if (t.targetUserId) {
      const user = await prisma.user.findUnique({ where: { id: t.targetUserId }, select: { organizationId: true } });
      if (!user || user.organizationId !== data.organizationId) {
        throw new ValidationError("All targets must belong to the same organization");
      }
    }
    if (t.targetTeamId) {
      const team = await prisma.functionalTeam.findUnique({ where: { id: t.targetTeamId }, select: { organizationId: true } });
      if (!team || team.organizationId !== data.organizationId) {
        throw new ValidationError("All targets must belong to the same organization");
      }
    }
  }

  return prisma.executiveRequest.create({
    data: {
      organizationId: data.organizationId,
      createdByExecutiveId: data.createdByExecutiveId,
      title: data.title,
      description: data.description,
      requestedDate: new Date(data.requestedDate),
      preferredPeriod: (data.preferredPeriod as any) ?? "MORNING",
      requestedDurationSeconds: data.requestedDurationSeconds,
      urgency: data.urgency,
      targets: {
        create: data.targets.map((t) => ({
          targetType: t.targetType,
          targetUserId: t.targetUserId,
          targetTeamId: t.targetTeamId,
        })),
      },
    },
    include: requestInclude,
  });
}

function assertCanPlan(
  userId: string,
  isSecretary: boolean,
  request: { status: string; createdByExecutiveId: string; targets: { targetType: string; targetUserId: string | null }[] }
) {
  if (isSecretary) return; // Secretary can plan any request in their org

  // Named user: exactly one USER target, target is the user
  const userTargets = request.targets.filter((t) => t.targetType === "USER");
  const hasNonUserTargets = request.targets.some((t) => t.targetType !== "USER");
  if (hasNonUserTargets || userTargets.length !== 1 || userTargets[0].targetUserId !== userId) {
    throw new ForbiddenError("You are not authorized to plan this request");
  }
}

function validateWindow(
  requestedDate: Date,
  preferredPeriod: string,
  scheduledAt: Date,
  durationSeconds: number
) {
  const window = preferredPeriod === "AFTERNOON" ? WINDOW_AFTERNOON : WINDOW_MORNING;

  const meetingDate = new Date(Date.UTC(scheduledAt.getFullYear(), scheduledAt.getMonth(), scheduledAt.getDate()));
  const requestDate = new Date(Date.UTC(requestedDate.getFullYear(), requestedDate.getMonth(), requestedDate.getDate()));

  if (meetingDate.getTime() !== requestDate.getTime()) {
    throw new ValidationError("Meeting must be scheduled on the requested date", "EXECUTIVE_REQUEST_WINDOW_VIOLATION");
  }

  const startHour = scheduledAt.getUTCHours() + scheduledAt.getUTCMinutes() / 60;
  const endDate = new Date(scheduledAt.getTime() + durationSeconds * 1000);
  const endHour = endDate.getUTCHours() + endDate.getUTCMinutes() / 60;

  if (startHour < window.start || endHour > window.end) {
    throw new ValidationError(
      `Meeting must be within ${window.start}:00–${window.end}:00 for ${preferredPeriod.toLowerCase()} period`,
      "EXECUTIVE_REQUEST_WINDOW_VIOLATION"
    );
  }
}

export async function planMeetingFromRequest(
  requestId: string,
  userId: string,
  isSecretary: boolean,
  data: {
    title: string;
    scheduledAt: string;
    plannedDurationSeconds: number;
    locationType: "PHYSICAL" | "ONLINE" | "HYBRID";
    roomId?: string | null;
    onlineLink?: string | null;
    ownerTeamId: string;
    attendeeIds: string[];
    agendaItems: { title: string; durationSeconds: number; speakerIds?: string[]; notes?: string | null; sortOrder?: number }[];
    parkingLotItemIds?: string[];
    organizerId?: string | null;
  }
) {
  const request = await prisma.executiveRequest.findUnique({
    where: { id: requestId },
    include: { targets: true },
  });
  if (!request) throw new NotFoundError("ExecutiveRequest");

  assertCanPlan(userId, isSecretary, request);

  if (request.status !== "OPEN" && request.status !== "PLANNING") {
    throw new ValidationError(
      `Request status '${request.status}' does not allow planning. Only OPEN or PLANNING requests can be planned`
    );
  }

  if (request.currentMeetingId) {
    const currentMeeting = await prisma.meeting.findUnique({
      where: { id: request.currentMeetingId },
      select: { status: true },
    });
    if (currentMeeting && currentMeeting.status !== "CANCELLED" && currentMeeting.status !== "COMPLETED_LOCKED") {
      throw new ValidationError("Executive request already has an active planned meeting", "EXECUTIVE_REQUEST_ALREADY_PLANNED");
    }
  }

  const scheduledAt = new Date(data.scheduledAt);
  validateWindow(request.requestedDate, request.preferredPeriod, scheduledAt, data.plannedDurationSeconds);

  if (!data.agendaItems || data.agendaItems.length === 0) {
    throw new ValidationError("Structured meetings require at least one agenda item");
  }

  const totalAgendaSeconds = data.agendaItems.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  if (totalAgendaSeconds > data.plannedDurationSeconds) {
    throw new ValidationError(
      `Total agenda duration (${totalAgendaSeconds / 60}min) exceeds planned duration (${data.plannedDurationSeconds / 60}min)`
    );
  }

  // Organizer validation: defaults to userId, Secretary can override
  const organizerId = (isSecretary && data.organizerId) ? data.organizerId : userId;
  if (organizerId !== userId && organizerId !== data.organizerId) {
    // already handled - just verify organizer is attendee or planner below
  }

  // Verify organizer is attendee or the planner
  if (!data.attendeeIds.includes(organizerId) && organizerId !== userId) {
    throw new ValidationError("Organizer must be an attendee or the planning user");
  }

  // Room conflict check
  if (data.roomId) {
    const endsAt = new Date(scheduledAt.getTime() + data.plannedDurationSeconds * 1000);
    const conflicting = await prisma.roomBooking.findFirst({
      where: {
        roomId: data.roomId,
        startsAt: { lt: endsAt },
        endsAt: { gt: scheduledAt },
      },
    });
    if (conflicting) {
      throw new ValidationError("Room is already booked during this time", "ROOM_CONFLICT");
    }
  }

  // Verify parking lot items belong to same org
  if (data.parkingLotItemIds?.length) {
    const items = await prisma.parkingLotItem.findMany({
      where: { id: { in: data.parkingLotItemIds } },
      select: { organizationId: true, status: true },
    });
    for (const item of items) {
      if (item.organizationId !== request.organizationId) {
        throw new ValidationError("Parking lot items must belong to the same organization");
      }
      if (item.status !== "APPROVED") {
        throw new ValidationError("Parking lot items must be in APPROVED status");
      }
    }
  }

  // Create meeting and link request in one transaction
  const [meeting] = await prisma.$transaction(async (tx) => {
    const created = await tx.meeting.create({
      data: {
        title: data.title,
        kind: "STRUCTURED",
        plannedDurationSeconds: data.plannedDurationSeconds,
        organizationId: request.organizationId,
        createdById: userId,
        organizerId,
        ownerTeamId: data.ownerTeamId,
        roomId: data.roomId,
        locationType: data.locationType,
        onlineLink: data.onlineLink,
        scheduledAt,
        status: "SCHEDULED",
        executiveRequestId: requestId,
        attendees: data.attendeeIds
          ? { create: data.attendeeIds.map((uid) => ({ userId: uid })) }
          : undefined,
        agendaItems: {
          create: data.agendaItems.map((item, index) => ({
            title: item.title,
            durationSeconds: item.durationSeconds ?? 0,
            notes: item.notes,
            sortOrder: item.sortOrder ?? index,
            speakers: item.speakerIds?.length
              ? { create: item.speakerIds.map((sid) => ({ userId: sid })) }
              : undefined,
          })),
        },
      },
      include: { attendees: { include: { user: true } }, agendaItems: { orderBy: { sortOrder: "asc" }, include: { speakers: true } } },
    });

    // Room booking
    if (data.roomId && scheduledAt) {
      const endsAt = new Date(scheduledAt.getTime() + data.plannedDurationSeconds * 1000);
      await tx.roomBooking.create({
        data: { meetingId: created.id, roomId: data.roomId, startsAt: scheduledAt, endsAt },
      });
    }

    // Link parking lot items
    if (data.parkingLotItemIds?.length) {
      await tx.parkingLotItem.updateMany({
        where: { id: { in: data.parkingLotItemIds }, organizationId: request.organizationId, status: "APPROVED" },
        data: { status: "USED_IN_AGENDA", agendaMeetingId: created.id },
      });
    }

    // Transition request to SCHEDULED, link currentMeetingId
    await tx.executiveRequest.update({
      where: { id: requestId },
      data: {
        status: "SCHEDULED",
        currentMeetingId: created.id,
      },
    });

    return [created];
  });

  return meeting;
}

const TRANSITIONS: Record<ExecutiveRequestStatus, ExecutiveRequestStatus[]> = {
  OPEN: ["PLANNING", "CANCELLED"],
  PLANNING: ["SCHEDULED", "OPEN", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "PLANNING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function assertTransition(from: ExecutiveRequestStatus, to: ExecutiveRequestStatus) {
  const allowed = TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw new ValidationError(
      `Cannot transition ExecutiveRequest from '${from}' to '${to}'. Allowed: [${(allowed ?? []).join(", ") || "none"}]`
    );
  }
}

export async function transitionRequest(id: string, status: ExecutiveRequestStatus) {
  const req = await prisma.executiveRequest.findUnique({ where: { id } });
  if (!req) throw new NotFoundError("ExecutiveRequest");
  assertTransition(req.status, status);
  return prisma.executiveRequest.update({
    where: { id },
    data: {
      status,
      ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
    include: requestInclude,
  });
}
