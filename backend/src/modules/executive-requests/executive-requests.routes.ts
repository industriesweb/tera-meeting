import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import {
  listRequests,
  listMyRequests,
  listAssignedRequests,
  getRequest,
  createRequest,
  startPlanning,
  cancelRequest,
  returnToPlanning,
  planMeeting,
} from "./executive-requests.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listRequests);
router.get("/mine", listMyRequests);
router.get("/assigned", listAssignedRequests);
router.get("/:id", getRequest);
router.post("/", createRequest);
router.post("/:id/start-planning", startPlanning);
router.post("/:id/plan-meeting", planMeeting);
router.post("/:id/cancel", cancelRequest);
router.post("/:id/return-to-planning", returnToPlanning);

export default router;
