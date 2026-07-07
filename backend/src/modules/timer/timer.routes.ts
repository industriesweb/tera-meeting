import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getTimerState, timerAction } from "./timer.controller";

const router = Router();

router.use(requireAuth);

router.get("/:meetingId", getTimerState);
router.post("/:meetingId/:action", timerAction);

export default router;
