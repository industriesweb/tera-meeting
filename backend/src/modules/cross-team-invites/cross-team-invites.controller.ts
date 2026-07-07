import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { getPolicyUser, isSecretary } from "../../policies/access-policy";
import { ForbiddenError } from "../../common/errors/app-error";
import * as invitesService from "./cross-team-invites.service";
import { isMeetingOrganizer } from "../../policies/meeting-policy";

export const createInvite = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const meetingId = req.params.meetingId as string;

  const isOrganizer = await isMeetingOrganizer(meetingId, req.user!.sub);
  if (!isSecretary(actor) && !isOrganizer) {
    throw new ForbiddenError("Only secretaries and meeting organizers can request cross-team invites");
  }

  const { invitedUserId, invitedFromTeamId } = req.body;
  const invite = await invitesService.createInvite({
    meetingId,
    invitedUserId,
    invitedFromTeamId,
    requestedById: req.user!.sub,
  });
  res.status(201).json(invite);
});

export const reviewInvite = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const invite = await invitesService.getInvitesForMeeting(req.params.meetingId as string);
  const targetInvite = invite.find((i) => i.id === req.params.id);
  if (!targetInvite) throw new ForbiddenError("Invite not found");

  if (actor.functionalTeamId !== targetInvite.invitedFromTeamId && !isSecretary(actor)) {
    throw new ForbiddenError("Only the invited user's team admin can review this invite");
  }
  if (actor.operationalRole !== "TEAM_ADMIN" && !isSecretary(actor)) {
    throw new ForbiddenError("Only team admins and secretaries can review invites");
  }

  const { status } = req.body;
  if (status !== "APPROVED" && status !== "DECLINED") {
    return res.status(400).json({ error: "Status must be APPROVED or DECLINED" });
  }

  const updated = await invitesService.reviewInvite(req.params.id as string, status, req.user!.sub);
  res.json(updated);
});

export const listInvitesForMeeting = asyncHandler(async (req: Request, res: Response) => {
  const invites = await invitesService.getInvitesForMeeting(req.params.meetingId as string);
  res.json(invites);
});
