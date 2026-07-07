import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getDashboard } from "./dashboard.controller";

const router = Router();
router.use(requireAuth);
router.get("/", getDashboard);

export default router;
