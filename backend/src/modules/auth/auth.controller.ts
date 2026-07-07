import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as authService from "./auth.service";

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getOrCreateProfile(req.user!.sub, req.user!.email);
  res.json(user);
});
