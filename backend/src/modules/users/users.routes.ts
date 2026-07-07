import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import { listUsers, getUser, createUser, updateUser, approveUser } from "./users.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listUsers);
router.post("/", createUser);
router.get("/:id", getUser);
router.patch("/:id", updateUser);
router.post("/:id/approve", approveUser);

export default router;
