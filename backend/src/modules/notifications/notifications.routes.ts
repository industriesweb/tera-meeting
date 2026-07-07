import { Router } from "express";
import { requireAuth } from "../../common/middleware/auth";
import {
  listNotifications, getUnreadCount, markAsRead, markAllAsRead,
  getPreferences, updatePreferences,
} from "./notifications.controller";

const router = Router();

router.use(requireAuth);

router.get("/", listNotifications);
router.get("/unread", getUnreadCount);
router.post("/read-all", markAllAsRead);
router.post("/:id/read", markAsRead);
router.get("/preferences", getPreferences);
router.patch("/preferences", updatePreferences);

export default router;
