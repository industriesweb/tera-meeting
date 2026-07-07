import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as agendaService from "./agenda.service";
import { ValidationError } from "../../common/errors/app-error";

export const listAgendaItems = asyncHandler(async (req: Request, res: Response) => {
  const items = await agendaService.listAgendaItems(req.params.meetingId as string);
  res.json(items);
});

export const getAgendaItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await agendaService.getAgendaItem(req.params.id as string);
  res.json(item);
});

export const createAgendaItem = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_AGENDA_MUTATION_DISABLED", message: "Agenda mutation endpoints are disabled. Agenda is set at creation time and managed by the timer service." },
  });
});

export const updateAgendaItem = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_AGENDA_MUTATION_DISABLED", message: "Agenda mutation endpoints are disabled. Agenda is set at creation time and managed by the timer service." },
  });
});

export const deleteAgendaItem = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_AGENDA_MUTATION_DISABLED", message: "Agenda mutation endpoints are disabled. Agenda is set at creation time and managed by the timer service." },
  });
});

export const toggleReady = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_AGENDA_MUTATION_DISABLED", message: "Agenda ready/toggle endpoints are disabled. Agenda progression is managed by the timer service." },
  });
});

export const reorderItems = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_AGENDA_MUTATION_DISABLED", message: "Agenda reorder endpoints are disabled. Agenda order is set at creation time." },
  });
});
