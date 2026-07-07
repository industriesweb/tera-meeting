import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";

const router = Router();
router.use(requireAuth);
export default router;
