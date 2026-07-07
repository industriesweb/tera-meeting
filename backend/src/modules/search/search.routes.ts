import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { search } from "./search.controller";

const router = Router();
router.use(requireAuth);
router.get("/", search);

export default router;
