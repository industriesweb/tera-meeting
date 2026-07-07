import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { getPolicyUser } from "../../policies/access-policy";
import { ForbiddenError } from "../../common/errors/app-error";
import * as joinService from "./meeting-join-requests.service";
import { isMeetingOrganizer } from "../../policies/meeting-policy";

export const requestJoin = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const request = await joinService.createJoinRequest(meetingId, req.user!.sub);
  res.status(201).json(request);
});

export const reviewJoinRequest = asyncHandler(async (req: Request, res: Response) => {
  const meetingId = req.params.meetingId as string;
  const isOrganizer = await isMeetingOrganizer(meetingId, req.user!.sub);
  if (!isOrganizer) {
    throw new ForbiddenError("Only the meeting organizer can review join requests");
  }

  const { status } = req.body;
  if (status !== "APPROVED" && status !== "DECLINED") {
    return res.status(400).json({ error: "Status must be APPROVED or DECLINED" });
  }

  const updated = await joinService.reviewJoinRequest(req.params.id as string, meetingId, status, req.user!.sub);
  res.json(updated);
});
