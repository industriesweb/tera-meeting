import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getWeeklyView, getDayCalendar, getAvailableSlots, getDraftsNeedingNudge } from "./calendar.controller";

const router = Router();

router.use(requireAuth);

router.get("/", getWeeklyView);
router.get("/day", getDayCalendar);
router.get("/slots", getAvailableSlots);
router.get("/drafts/nudge", getDraftsNeedingNudge);

export default router;
