import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getAuditEvents } from "./organizations.controller";

const router = Router();

router.use(requireAuth);

router.get("/audit", getAuditEvents);

export default router;
