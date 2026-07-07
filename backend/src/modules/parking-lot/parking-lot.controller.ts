import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { getPolicyUser, isSecretary, isTeamAdmin, isMember } from "../../policies/access-policy";
import { buildMeetingVisibilityFilter } from "../../policies/meeting-visibility";
import { ForbiddenError, ValidationError } from "../../common/errors/app-error";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import { prisma } from "../../config/database";
import * as parkingLotService from "./parking-lot.service";

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const organizationId = await resolveOrganizationId(req);
  const { teamId, title, note, sourceMeetingId } = req.body;

  if (!actor.functionalTeamId && !isSecretary(actor)) {
    throw new ForbiddenError("You must belong to a team to create a parking lot item");
  }

  if (isMember(actor) && !isSecretary(actor)) {
    if (actor.functionalTeamId !== teamId) {
      throw new ForbiddenError("You can only create items for your own team");
    }
  }

  const item = await parkingLotService.createItem({
    organizationId,
    teamId,
    title,
    note,
    createdById: req.user!.sub,
    sourceMeetingId,
  });
  res.status(201).json(item);
});

export const listMyTeamItems = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!actor.functionalTeamId) {
    return res.json([]);
  }
  const items = await parkingLotService.listTeamItems(actor.functionalTeamId, req.user!.sub);
  res.json(items);
});

export const listTeamItems = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const teamId = req.params.teamId as string;

  if (!isSecretary(actor) && !isTeamAdmin(actor)) {
    throw new ForbiddenError("Only secretaries and team admins can view team items");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== teamId) {
    throw new ForbiddenError("You can only view your own team's items");
  }

  const items = await parkingLotService.listTeamItems(teamId, req.user!.sub);
  res.json(items);
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const item = await parkingLotService.getItem(req.params.id as string);

  const canView =
    isSecretary(actor) ||
    (actor.functionalTeamId === item.teamId && (item.status !== "ARCHIVED" || isTeamAdmin(actor) || item.createdById === actor.id)) ||
    (isTeamAdmin(actor) && actor.functionalTeamId === item.teamId);

  if (!canView) {
    throw new ForbiddenError("You do not have access to this parking lot item");
  }
  res.json(item);
});

export const approveItem = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const item = await parkingLotService.getItem(req.params.id as string);

  if (isMember(actor) && !isSecretary(actor)) {
    throw new ForbiddenError("Members cannot approve items");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== item.teamId) {
    throw new ForbiddenError("You can only approve items for your own team");
  }

  const updated = await parkingLotService.approveItem(req.params.id as string, req.user!.sub);
  res.json(updated);
});

export const archiveItem = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const item = await parkingLotService.getItem(req.params.id as string);

  if (isMember(actor) && !isSecretary(actor)) {
    throw new ForbiddenError("Members cannot archive items");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== item.teamId) {
    throw new ForbiddenError("You can only archive items for your own team");
  }

  const updated = await parkingLotService.archiveItem(req.params.id as string);
  res.json(updated);
});

export const addToAgenda = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const item = await parkingLotService.getItem(req.params.id as string);

  if (isMember(actor) && !isSecretary(actor)) {
    throw new ForbiddenError("Members cannot add items to agenda");
  }
  if (isTeamAdmin(actor) && actor.functionalTeamId !== item.teamId) {
    throw new ForbiddenError("You can only manage items for your own team");
  }

  const { agendaMeetingId } = req.body;
  if (!agendaMeetingId) {
    throw new ValidationError("agendaMeetingId is required");
  }

  const visibilityFilter = await buildMeetingVisibilityFilter(req.user!.sub);
  const meeting = await prisma.meeting.findFirst({
    where: { id: agendaMeetingId, ...visibilityFilter },
    select: { id: true },
  });
  if (!meeting) {
    throw new ForbiddenError("You do not have access to the target meeting");
  }

  const updated = await parkingLotService.addToAgenda(req.params.id as string, agendaMeetingId, req.user!.sub);
  res.json(updated);
});
