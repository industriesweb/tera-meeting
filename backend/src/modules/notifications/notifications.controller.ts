import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as notificationsService from "./notifications.service";

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const notifications = await notificationsService.listNotifications(req.user!.sub);
  res.json(notifications);
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const count = await notificationsService.getUnreadCount(req.user!.sub);
  res.json({ count });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationsService.markAsRead(req.params.id as string, req.user!.sub);
  res.json(notification);
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  await notificationsService.markAllAsRead(req.user!.sub);
  res.json({ success: true });
});

export const getPreferences = asyncHandler(async (req: Request, res: Response) => {
  const prefs = await notificationsService.getPreferences(req.user!.sub);
  res.json(prefs);
});

export const updatePreferences = asyncHandler(async (req: Request, res: Response) => {
  const prefs = await notificationsService.updatePreferences(req.user!.sub, req.body);
  res.json(prefs);
});
