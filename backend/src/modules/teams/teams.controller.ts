import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { getPolicyUser, isSecretary, isTeamAdmin } from "../../policies/access-policy";
import { requireSecretary } from "../../policies/access-policy";
import { ValidationError, ForbiddenError } from "../../common/errors/app-error";
import * as teamsService from "./teams.service";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";

export const listTeams = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = await resolveOrganizationId(req);
  const teams = await teamsService.listTeams(organizationId);
  res.json(teams);
});

export const getTeam = asyncHandler(async (req: Request, res: Response) => {
  const team = await teamsService.getTeam(req.params.id as string);
  res.json(team);
});

export const createTeam = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  requireSecretary(actor, "create teams");
  const organizationId = await resolveOrganizationId(req);
  const { name } = req.body;
  const team = await teamsService.createTeam(organizationId, name, req.user!.sub);
  res.status(201).json(team);
});

export const updateTeam = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  requireSecretary(actor, "update teams");
  const team = await teamsService.updateTeam(req.params.id as string, req.body, req.user!.sub);
  res.json(team);
});

export const deleteTeam = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  requireSecretary(actor, "delete teams");
  await teamsService.deleteTeam(req.params.id as string, req.user!.sub);
  res.json({ deleted: true });
});

export const addTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const teamId = req.params.id as string;
  const userId = req.body.userId as string;
  if (!isSecretary(actor) && !isTeamAdmin(actor)) {
    throw new ForbiddenError("Only secretaries and team admins can manage team members");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== teamId) {
    throw new ForbiddenError("Team admins can only manage their own team");
  }
  const user = await teamsService.addTeamMember(teamId, userId, req.user!.sub);
  res.json(user);
});

export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const teamId = req.params.id as string;
  const userId = req.params.userId as string;
  if (!isSecretary(actor) && !isTeamAdmin(actor)) {
    throw new ForbiddenError("Only secretaries and team admins can manage team members");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== teamId) {
    throw new ForbiddenError("Team admins can only manage their own team");
  }
  const user = await teamsService.removeTeamMember(teamId, userId, req.user!.sub);
  res.json(user);
});
