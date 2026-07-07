import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as searchService from "./search.service";

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = (req.query.q as string) || "";
  const results = await searchService.search(req.user!.sub, q);
  res.json(results);
});
