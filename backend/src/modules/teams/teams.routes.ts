import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { listTeams, getTeam, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember } from "./teams.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listTeams);
router.get("/:id", getTeam);
router.post("/", createTeam);
router.patch("/:id", updateTeam);
router.delete("/:id", deleteTeam);
router.post("/:id/members", addTeamMember);
router.delete("/:id/members/:userId", removeTeamMember);

export default router;
