import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import { ValidationError } from "../../common/errors/app-error";
import * as calendarService from "./calendar.service";

export const getDayCalendar = asyncHandler(async (req: Request, res: Response) => {
  const dateStr = req.query.date as string;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ValidationError("date must be YYYY-MM-DD");
  }
  const data = await calendarService.getDayCalendar(req.user!.sub, dateStr);
  res.json(data);
});

export const getWeeklyView = asyncHandler(async (req: Request, res: Response) => {
  const view = (req.query.view as string) || "week";
  const weekStart = req.query.week
    ? new Date(req.query.week as string)
    : startOfWeek(new Date());
  const data = await calendarService.getWeeklyView(req.user!.sub, weekStart);
  res.json({ view, data });
});

export const getAvailableSlots = asyncHandler(async (req: Request, res: Response) => {
  const { date, duration, userIds } = req.query as any;
  const organizationId = await resolveOrganizationId(req);
  const slots = await calendarService.getAvailableSlots(
    organizationId,
    date,
    duration ? parseInt(duration, 10) : undefined,
    userIds ? (Array.isArray(userIds) ? userIds : userIds.split(",").filter(Boolean)) : undefined
  );
  res.json(slots);
});

export const getDraftsNeedingNudge = asyncHandler(async (_req: Request, res: Response) => {
  const drafts = await calendarService.getDraftsNeedingNudge();
  res.json(drafts);
});

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
