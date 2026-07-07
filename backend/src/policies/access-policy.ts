import { ForbiddenError } from "../common/errors/app-error";
import type { OperationalRole } from "@prisma/client";
import { prisma } from "../config/database";

export interface PolicyUser {
  id: string;
  operationalRole: OperationalRole | null;
  isExecutive: boolean;
  functionalTeamId: string | null;
  organizationId: string;
}

export function isSecretary(user: Pick<PolicyUser, "operationalRole">): boolean {
  return user.operationalRole === "SECRETARY";
}

export function isTeamAdmin(user: Pick<PolicyUser, "operationalRole">): boolean {
  return user.operationalRole === "TEAM_ADMIN";
}

export function isMember(user: Pick<PolicyUser, "operationalRole">): boolean {
  const role = user.operationalRole ?? "MEMBER";
  return role === "MEMBER";
}

export function isExecutive(user: Pick<PolicyUser, "isExecutive">): boolean {
  return user.isExecutive;
}

export function isTeamAdminOf(user: Pick<PolicyUser, "operationalRole" | "functionalTeamId">, teamId: string): boolean {
  return user.operationalRole === "TEAM_ADMIN" && user.functionalTeamId === teamId;
}

export function canManageOrganization(user: PolicyUser): boolean {
  return isSecretary(user);
}

export function canManageTeamMembership(user: PolicyUser, teamId: string): boolean {
  return isSecretary(user) || isTeamAdminOf(user, teamId);
}

export function canCreateMeeting(user: PolicyUser, input?: { ownerTeamId?: string | null }): boolean {
  if (isSecretary(user)) return true;
  if (
    isTeamAdmin(user) &&
    user.functionalTeamId &&
    input?.ownerTeamId &&
    input.ownerTeamId === user.functionalTeamId
  ) {
    return true;
  }
  return false;
}

export function requireSecretary(user: PolicyUser, action = "perform this action"): void {
  if (!isSecretary(user)) {
    throw new ForbiddenError(`Only a secretary can ${action}`);
  }
}

export function requireTeamAdminOf(user: PolicyUser, teamId: string, action = "perform this action"): void {
  if (!isTeamAdminOf(user, teamId)) {
    throw new ForbiddenError(`Only a team admin of this team can ${action}`);
  }
}

export function requireManageOrganization(user: PolicyUser, action = "perform this action"): void {
  if (!canManageOrganization(user)) {
    throw new ForbiddenError(`Only a secretary can ${action}`);
  }
}

export function requireManageTeamMembership(user: PolicyUser, teamId: string, action = "perform this action"): void {
  if (!canManageTeamMembership(user, teamId)) {
    throw new ForbiddenError(`Only a secretary or team admin can ${action}`);
  }
}

export async function getPolicyUser(userId: string): Promise<PolicyUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      operationalRole: true,
      isExecutive: true,
      functionalTeamId: true,
      organizationId: true,
    },
  });
  if (!user) throw new Error(`User ${userId} not found`);
  return {
    id: user.id,
    operationalRole: user.operationalRole,
    isExecutive: user.isExecutive,
    functionalTeamId: user.functionalTeamId,
    organizationId: user.organizationId,
  };
}
