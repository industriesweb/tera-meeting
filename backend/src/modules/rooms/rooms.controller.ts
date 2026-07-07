import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import { getPolicyUser } from "../../policies/access-policy";
import { requireCanManageRooms } from "../../policies/team-policy";
import * as roomsService from "./rooms.service";
import { createRoomSchema, updateRoomSchema } from "../../common/validators";

export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = await resolveOrganizationId(req);
  const rooms = await roomsService.listRooms(organizationId);
  res.json(rooms);
});

export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  const room = await roomsService.getRoomById(req.params.id as string);
  res.json(room);
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const user = await getPolicyUser(req.user!.sub);
  requireCanManageRooms(user);
  const { name } = createRoomSchema.parse(req.body);
  const organizationId = await resolveOrganizationId(req);
  const room = await roomsService.createRoom(organizationId, name, req.user!.sub);
  res.status(201).json(room);
});

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const user = await getPolicyUser(req.user!.sub);
  requireCanManageRooms(user);
  const parsed = updateRoomSchema.parse(req.body);
  const room = await roomsService.updateRoom(req.params.id as string, parsed, req.user!.sub);
  res.json(room);
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const user = await getPolicyUser(req.user!.sub);
  requireCanManageRooms(user);
  await roomsService.deleteRoom(req.params.id as string, req.user!.sub);
  res.json({ deleted: true });
});

export const checkRoomConflicts = asyncHandler(async (req: Request, res: Response) => {
  const { roomId, start, durationMinutes, excludeMeetingId } = req.query as any;
  const conflicts = await roomsService.checkRoomConflict(
    roomId,
    new Date(start),
    parseInt(durationMinutes, 10),
    excludeMeetingId
  );
  res.json(conflicts);
});
