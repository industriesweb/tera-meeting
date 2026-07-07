import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { getPolicyUser, isSecretary, isExecutive, isTeamAdmin } from "../../policies/access-policy";
import { ForbiddenError, ValidationError } from "../../common/errors/app-error";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import * as requestsService from "./executive-requests.service";
import { planExecutiveRequestMeetingSchema, planExecutiveRequestMeetingInternalSchema } from "../../common/validators";

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (isSecretary(actor)) {
    const requests = await requestsService.listRequests(actor.organizationId);
    return res.json(requests);
  }
  throw new ForbiddenError("Only secretaries can list all requests");
});

export const listMyRequests = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isExecutive(actor) && !isSecretary(actor)) {
    throw new ForbiddenError("Only executives and secretaries can view requests");
  }
  // Executives see their own; secretaries see all (handled in listRequests)
  const requests = await requestsService.listMyRequests(req.user!.sub);
  res.json(requests);
});

export const listAssignedRequests = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const requests = await requestsService.listAssignedRequests(actor);
  res.json(requests);
});

export const getRequest = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const request = await requestsService.getRequest(req.params.id as string);

  if (isSecretary(actor) && actor.organizationId !== request.organizationId) {
    throw new ForbiddenError("You do not have access to this request");
  }

  const canView =
    isSecretary(actor) ||
    request.createdByExecutiveId === actor.id ||
    request.targets.some((t) => t.targetType === "USER" && t.targetUserId === actor.id) ||
    request.targets.some((t) => t.targetType === "TEAM" && t.targetTeamId && isTeamAdmin(actor) && actor.functionalTeamId === t.targetTeamId);

  if (!canView) {
    throw new ForbiddenError("You do not have access to this request");
  }
  res.json(request);
});

export const createRequest = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isExecutive(actor)) {
    throw new ForbiddenError("Only executives can create requests");
  }
  const organizationId = await resolveOrganizationId(req);
  if (actor.organizationId !== organizationId) {
    throw new ForbiddenError("Cannot create a request for a different organization");
  }

  const request = await requestsService.createRequest({
    organizationId,
    createdByExecutiveId: req.user!.sub,
    title: req.body.title,
    description: req.body.description,
    requestedDate: req.body.requestedDate,
    preferredPeriod: req.body.preferredPeriod,
    requestedDurationSeconds: req.body.requestedDurationSeconds,
    urgency: req.body.urgency,
    targets: req.body.targets,
  });
  res.status(201).json(request);
});

export const startPlanning = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isSecretary(actor)) {
    throw new ForbiddenError("Only secretaries can start planning");
  }
  const request = await requestsService.transitionRequest(req.params.id as string, "PLANNING");
  res.json(request);
});

export const cancelRequest = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isSecretary(actor)) {
    throw new ForbiddenError("Only secretaries can cancel requests");
  }
  const updated = await requestsService.transitionRequest(req.params.id as string, "CANCELLED");
  res.json(updated);
});

export const returnToPlanning = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  if (!isSecretary(actor)) {
    throw new ForbiddenError("Only secretaries can return a request to planning");
  }
  const request = await requestsService.transitionRequest(req.params.id as string, "PLANNING");
  res.json(request);
});

export const planMeeting = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  const request = await requestsService.getRequest(req.params.id as string);

  if (actor.organizationId !== request.organizationId) {
    throw new ForbiddenError("Cannot plan a request from a different organization");
  }

  const isSec = isSecretary(actor);
  const wantsOrganizerOverride = isSec && req.body.organizerId !== undefined;
  // Public schema rejects organizerId; internal schema allows Secretary override.
  const schema = wantsOrganizerOverride
    ? planExecutiveRequestMeetingInternalSchema
    : planExecutiveRequestMeetingSchema;

  const parsed = schema.parse(req.body);
  const meeting = await requestsService.planMeetingFromRequest(
    req.params.id as string,
    req.user!.sub,
    isSec,
    parsed
  );
  res.status(201).json(meeting);
});
