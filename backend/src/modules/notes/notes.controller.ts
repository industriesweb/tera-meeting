import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import * as entriesService from "./entries.service";

export const listNotes = asyncHandler(async (req: Request, res: Response) => {
  const notes = await entriesService.listNotes(req.params.meetingId as string, req.user!.sub);
  res.json(notes);
});

export const createNote = asyncHandler(async (req: Request, res: Response) => {
  const note = await entriesService.createNote(req.params.meetingId as string, req.user!.sub, req.body);
  res.status(201).json(note);
});
