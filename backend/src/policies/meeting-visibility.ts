import { prisma } from "../config/database";

export type MeetingVisibilityFilter = Record<string, unknown>;

export async function buildMeetingVisibilityFilter(userId: string): Promise<MeetingVisibilityFilter> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { operationalRole: true, functionalTeamId: true, organizationId: true, isExecutive: true },
  });

  if (!user) return { id: "" };

  if (user.operationalRole === "SECRETARY") {
    return { organizationId: user.organizationId };
  }

  const isTeamAdmin = user.operationalRole === "TEAM_ADMIN";
  const clauses: Record<string, unknown>[] = [
    { organizerId: userId },
    { attendees: { some: { userId, removedAt: null } } },
    { agendaItems: { some: { speakers: { some: { userId } } } } },
    { createdById: userId },
  ];

  if (isTeamAdmin && user.functionalTeamId) {
    clauses.push({ ownerTeamId: user.functionalTeamId });
  }

  if (user.isExecutive) {
    clauses.push({ executiveRequest: { createdByExecutiveId: userId } });
  }

  return { OR: clauses, organizationId: user.organizationId };
}
