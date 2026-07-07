import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getMeetingReport, logMeeting } from "./reports.controller";

const router = Router();

router.use(requireAuth);

router.get("/:id", getMeetingReport);
router.post("/:id/log", logMeeting);

export default router;
