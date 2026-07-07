import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import {
  listAgendaItems, getAgendaItem, createAgendaItem,
  updateAgendaItem, deleteAgendaItem, toggleReady, reorderItems
} from "./agenda.controller";

const router = Router();

router.use(requireAuth);

router.get("/meeting/:meetingId", listAgendaItems);
router.post("/meeting/:meetingId", createAgendaItem);
router.put("/meeting/:meetingId/reorder", reorderItems);
router.get("/:id", getAgendaItem);
router.patch("/:id", updateAgendaItem);
router.delete("/:id", deleteAgendaItem);
router.post("/:id/ready", toggleReady);

export default router;
