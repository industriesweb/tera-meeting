import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import {
  createItem,
  listMyTeamItems,
  listTeamItems,
  getItem,
  approveItem,
  archiveItem,
  addToAgenda,
} from "./parking-lot.controller";

const router = Router();

router.use(requireAuth);

router.post("/", createItem);
router.get("/my-team", listMyTeamItems);
router.get("/team/:teamId", listTeamItems);
router.get("/:id", getItem);
router.post("/:id/approve", approveItem);
router.post("/:id/archive", archiveItem);
router.post("/:id/addToAgenda", addToAgenda);

export default router;
