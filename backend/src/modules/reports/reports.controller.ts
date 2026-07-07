import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as reportsService from "./reports.service";

export const getMeetingReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await reportsService.getMeetingReport(req.params.id as string);
  res.json(report);
});

export const logMeeting = asyncHandler(async (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: { code: "LEGACY_COMMAND_DISABLED", message: "Report logging is disabled. Use end + summary + lock lifecycle instead." },
  });
});
