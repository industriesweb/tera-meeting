import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { listRooms, getRoom, createRoom, updateRoom, deleteRoom, checkRoomConflicts } from "./rooms.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listRooms);
router.get("/conflicts", checkRoomConflicts);
router.get("/:id", getRoom);
router.post("/", createRoom);
router.patch("/:id", updateRoom);
router.delete("/:id", deleteRoom);

export default router;
