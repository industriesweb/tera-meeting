import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { requestJoin, reviewJoinRequest } from "./meeting-join-requests.controller";

const router = Router();

router.use(requireAuth);

router.post("/meeting/:meetingId/request-join", requestJoin);
router.post("/meeting/:meetingId/review/:id", reviewJoinRequest);

export default router;
