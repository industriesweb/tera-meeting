import { ForbiddenError } from "../common/errors/app-error";
import type { PolicyUser } from "./access-policy";
import { isSecretary, isTeamAdmin, isMember } from "./access-policy";

export function requireCanManageRooms(user: PolicyUser): void {
  if (!isSecretary(user) && !isTeamAdmin(user)) {
    throw new ForbiddenError("Only secretaries and team admins can manage rooms");
  }
}

export function requireCanManageDepartments(user: PolicyUser): void {
  if (!isSecretary(user)) {
    throw new ForbiddenError("Only secretaries can manage departments");
  }
}

export function requireCanManageUsers(user: PolicyUser): void {
  if (!isSecretary(user) && !isTeamAdmin(user)) {
    throw new ForbiddenError("Only secretaries and team admins can manage users");
  }
}

export function requireCanChangeUserRole(user: PolicyUser): void {
  if (!isSecretary(user)) {
    throw new ForbiddenError("Only secretaries can change user roles");
  }
}

export function requireCanApproveUsers(user: PolicyUser): void {
  if (!isSecretary(user) && !isTeamAdmin(user)) {
    throw new ForbiddenError("Only secretaries and team admins can approve users");
  }
}
