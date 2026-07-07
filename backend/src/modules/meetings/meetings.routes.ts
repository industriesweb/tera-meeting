import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import {
  getMeetings, getMeeting, createMeeting, createQuickMeeting, createStructuredMeeting, updateMeeting, deleteMeeting,
  scheduleMeeting, startMeeting, completeMeeting, endMeeting, submitSummary, lockMeeting, archiveMeeting, cancelMeeting,
  overrideSchedule, overrideOrganizer, addAttendee, removeAttendee,
  getLiveState, skipCurrent, extendCurrent, extendOvertime, takeover,
} from "./meetings.controller";
import { getTimer, timerAction } from "./meetings.timer";

const router = Router();

router.use(requireAuth);

router.get("/", getMeetings);
// Deprecated/internal compatibility route. Frontend clients use /quick or /structured.
router.post("/", createMeeting);
router.post("/quick", createQuickMeeting);
router.post("/structured", createStructuredMeeting);
router.get("/:id", getMeeting);
router.patch("/:id", updateMeeting);
router.post("/:id/schedule", scheduleMeeting);
router.post("/:id/start", startMeeting);
router.post("/:id/complete", completeMeeting);
router.post("/:id/end", endMeeting);
router.post("/:id/summary", submitSummary);
router.post("/:id/lock", lockMeeting);
router.post("/:id/archive", archiveMeeting);
router.post("/:id/cancel", cancelMeeting);
router.post("/:id/overrides/schedule", overrideSchedule);
router.post("/:id/overrides/organizer", overrideOrganizer);
router.post("/:id/attendees", addAttendee);
router.delete("/:id/attendees/:userId", removeAttendee);
router.get("/:id/live-state", getLiveState);
router.post("/:id/agenda/skip-current", skipCurrent);
router.post("/:id/agenda/extend-current", extendCurrent);
router.post("/:id/overtime/extend", extendOvertime);
router.post("/:id/takeover", takeover);
router.get("/:id/timer", getTimer);
router.post("/:id/timer/:action", timerAction);
router.delete("/:id", deleteMeeting);

export default router;
