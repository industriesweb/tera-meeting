import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { listNotes, createNote } from "./notes.controller";

const router = Router();

router.use(requireAuth);

router.get("/meeting/:meetingId", listNotes);
router.post("/meeting/:meetingId", createNote);

export default router;
