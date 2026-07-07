import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { wrapResponse } from "./common/middleware/response";
import { errorHandler } from "./common/middleware/error-handler";

import authRouter from "./modules/auth/auth.routes";
import usersRouter from "./modules/users/users.routes";
import meetingsRouter from "./modules/meetings/meetings.routes";
import roomsRouter from "./modules/rooms/rooms.routes";
import calendarRouter from "./modules/calendar/calendar.routes";
import agendaRouter from "./modules/agenda/agenda.routes";
import notesRouter from "./modules/notes/notes.routes";
import reportsRouter from "./modules/reports/reports.routes";
import timerRouter from "./modules/timer/timer.routes";
import notificationsRouter from "./modules/notifications/notifications.routes";
import searchRouter from "./modules/search/search.routes";
import dashboardRouter from "./modules/dashboard/dashboard.routes";
import teamsRouter from "./modules/teams/teams.routes";
import executiveRequestsRouter from "./modules/executive-requests/executive-requests.routes";
import parkingLotRouter from "./modules/parking-lot/parking-lot.routes";
import crossTeamInvitesRouter from "./modules/cross-team-invites/cross-team-invites.routes";
import meetingJoinRequestsRouter from "./modules/meeting-join-requests/meeting-join-requests.routes";
import organizationsRouter from "./modules/organizations/organizations.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan("short"));
app.use(express.json());
app.use(wrapResponse);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "terra-meetings-api" });
});

app.get("/health/db", async (_req, res) => {
  try {
    const { prisma } = await import("./config/database");
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ success: false, error: { code: "DB_UNAVAILABLE", message: "Database connection failed" } });
  }
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/meetings", meetingsRouter);
app.use("/rooms", roomsRouter);
app.use("/calendar", calendarRouter);
app.use("/agenda", agendaRouter);
app.use("/notes", notesRouter);
app.use("/reports", reportsRouter);
app.use("/timer", timerRouter);
app.use("/notifications", notificationsRouter);
app.use("/search", searchRouter);
app.use("/dashboard", dashboardRouter);
app.use("/teams", teamsRouter);
app.use("/executive-requests", executiveRequestsRouter);
app.use("/parking-lot", parkingLotRouter);
app.use("/cross-team-invites", crossTeamInvitesRouter);
app.use("/meeting-join-requests", meetingJoinRequestsRouter);
app.use("/organizations", organizationsRouter);

app.use(errorHandler);

export default app;
