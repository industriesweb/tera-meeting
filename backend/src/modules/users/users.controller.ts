import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import { getPolicyUser, isSecretary, isTeamAdmin } from "../../policies/access-policy";
import { requireCanChangeUserRole, requireCanManageUsers, requireCanApproveUsers } from "../../policies/team-policy";
import { ForbiddenError } from "../../common/errors/app-error";
import * as usersService from "./users.service";

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = await resolveOrganizationId(req);
  const users = await usersService.listUsers(organizationId);
  res.json(users);
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await usersService.getUserById(req.params.id as string);
  res.json(user);
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isSecretary(actor)) {
    throw new ForbiddenError("Only secretaries can create users");
  }
  const organizationId = await resolveOrganizationId(req);
  const { name, email, functionalTeamId, operationalRole, isExecutive } = req.body;
  const result = await usersService.createUser({
    name, email, functionalTeamId, operationalRole, isExecutive, organizationId, actorId: req.user!.sub,
  });
  res.status(201).json({
    tempPassword: result.tempPassword,
    user: result.user,
  });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const isSelf = req.params.id === req.user!.sub;

  const isRoleChange = !!req.body.operationalRole || req.body.isExecutive !== undefined;
  const isNameChange = !!req.body.name;
  const isTeamChange = req.body.functionalTeamId !== undefined;

  if (req.body.role) {
    requireCanChangeUserRole(actor);
  }

  if (isRoleChange) {
    if (!isSecretary(actor)) {
      throw new ForbiddenError("Only secretaries can change operational role or executive status");
    }
  }

  if (isTeamChange) {
    const targetUserId = req.params.id as string;
    const targetUser = await usersService.getUserById(targetUserId);
    const isAddingToOwnTeam = isTeamAdmin(actor) && req.body.functionalTeamId === actor.functionalTeamId && !targetUser.functionalTeamId;
    if (isSecretary(actor)) {
      // Secretary can assign any user to any team
    } else if (isAddingToOwnTeam) {
      // Team Admin can add teamless user to own team
    } else {
      throw new ForbiddenError("Not authorized to assign this user to a team");
    }
  }

  if (!isRoleChange && !isTeamChange && isNameChange && !isSelf) {
    requireCanManageUsers(actor);
  }

  const user = await usersService.updateUser(req.params.id as string, req.body, req.user!.sub);
  res.json(user);
});

export const approveUser = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  requireCanApproveUsers(actor);
  const user = await usersService.approveUser(req.params.id as string);
  res.json(user);
});
