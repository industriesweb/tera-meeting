import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";

export const getTimerState = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_TIMER_DISABLED", message: "Legacy timer endpoints are disabled. Use GET /meetings/:id/live-state." },
  });
});

export const timerAction = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_TIMER_ACTION_DISABLED", message: "Legacy timer action endpoints are disabled. Use POST /meetings/:id/agenda/skip-current, /agenda/extend-current, /overtime/extend, or /takeover." },
  });
});
