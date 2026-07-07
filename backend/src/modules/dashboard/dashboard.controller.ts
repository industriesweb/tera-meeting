import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as dashboardService from "./dashboard.service";

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const data = await dashboardService.getDashboard(req.user!.sub);
  res.json(data);
});
