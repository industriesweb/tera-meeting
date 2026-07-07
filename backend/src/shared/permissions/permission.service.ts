import { prisma } from "../../config/database";
import { ForbiddenError } from "../../common/errors/app-error";

export async function canEditMeeting(userId: string, meetingId: string): Promise<boolean> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true },
  });
  return meeting?.organizerId === userId;
}

export async function canManageRoom(userId: string, organizationId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { operationalRole: true, organizationId: true } });
  if (!user) return false;
  if (user.organizationId !== organizationId) return false;
  return user.operationalRole === "SECRETARY" || user.operationalRole === "TEAM_ADMIN";
}

export async function canManageUsers(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { operationalRole: true } });
  return user?.operationalRole === "SECRETARY" || user?.operationalRole === "TEAM_ADMIN";
}

export function requireRole(...roles: string[]) {
  return async (req: any, _res: any, next: any) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { operationalRole: true } });
    if (!user || !roles.includes(user.operationalRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    next();
  };
}
