import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { createInvite, reviewInvite, listInvitesForMeeting } from "./cross-team-invites.controller";

const router = Router();

router.use(requireAuth);

router.get("/meeting/:meetingId", listInvitesForMeeting);
router.post("/meeting/:meetingId", createInvite);
router.post("/:id/meeting/:meetingId/review", reviewInvite);

export default router;
