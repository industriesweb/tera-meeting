import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { getMe } from "./auth.controller";

const router = Router();

router.get("/me", requireAuth, getMe);

export default router;
