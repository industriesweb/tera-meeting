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

app.post("/seed", async (_req, res) => {
  try {
    const { prisma } = await import("./config/database");
    const ids = {
      organization: "00000000-0000-4000-8000-000000000001",
      sales: "10000000-0000-4000-8000-000000000001",
      operations: "10000000-0000-4000-8000-000000000002",
      secretary: "20000000-0000-4000-8000-000000000001",
      salesAdmin: "20000000-0000-4000-8000-000000000002",
      operationsAdmin: "20000000-0000-4000-8000-000000000003",
      salesMember: "20000000-0000-4000-8000-000000000004",
      operationsMember: "20000000-0000-4000-8000-000000000005",
      executive: "20000000-0000-4000-8000-000000000006",
      speakerOnly: "20000000-0000-4000-8000-000000000007",
      boardroom: "30000000-0000-4000-8000-000000000001",
      huddleRoom: "30000000-0000-4000-8000-000000000002",
      quickMeeting: "40000000-0000-4000-8000-000000000001",
      structuredMeeting: "40000000-0000-4000-8000-000000000002",
      completedMeeting: "40000000-0000-4000-8000-000000000003",
      parkingPending: "50000000-0000-4000-8000-000000000001",
      parkingApproved: "50000000-0000-4000-8000-000000000002",
      executiveRequest: "60000000-0000-4000-8000-000000000001",
    };

    const existing = await prisma.organization.findUnique({ where: { id: ids.organization } });
    if (existing) {
      res.json({ ok: true, message: "Demo data already exists" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { id: ids.organization, name: "Terra Demo Co.", timezone: "Europe/London" } });
      await tx.functionalTeam.createMany({ data: [
        { id: ids.sales, organizationId: org.id, name: "Sales" },
        { id: ids.operations, organizationId: org.id, name: "Operations" },
      ]});
      await tx.user.createMany({ data: [
        { id: ids.secretary, organizationId: org.id, functionalTeamId: ids.operations, name: "Nizar", email: "nizarrtg@gmail.com", operationalRole: "SECRETARY" },
        { id: ids.salesAdmin, organizationId: org.id, functionalTeamId: ids.sales, name: "Sam Sales Admin", email: "sales.admin@example.com", operationalRole: "TEAM_ADMIN" },
        { id: ids.operationsAdmin, organizationId: org.id, functionalTeamId: ids.operations, name: "Olivia Operations Admin", email: "operations.admin@example.com", operationalRole: "TEAM_ADMIN" },
        { id: ids.salesMember, organizationId: org.id, functionalTeamId: ids.sales, name: "Maya Sales Member", email: "sales.member@example.com", operationalRole: "MEMBER" },
        { id: ids.operationsMember, organizationId: org.id, functionalTeamId: ids.operations, name: "Oscar Operations Member", email: "operations.member@example.com", operationalRole: "MEMBER" },
        { id: ids.executive, organizationId: org.id, functionalTeamId: ids.sales, name: "Evelyn Executive", email: "executive@example.com", operationalRole: "MEMBER", isExecutive: true },
        { id: ids.speakerOnly, organizationId: org.id, functionalTeamId: ids.operations, name: "Speaker Only", email: "speaker@example.com", operationalRole: "MEMBER" },
      ]});
      await tx.room.createMany({ data: [
        { id: ids.boardroom, organizationId: org.id, name: "Boardroom" },
        { id: ids.huddleRoom, organizationId: org.id, name: "Huddle Room" },
      ]});
      await tx.parkingLotItem.createMany({ data: [
        { id: ids.parkingPending, organizationId: org.id, teamId: ids.sales, title: "Review Q3 pipeline forecast", note: "Bring updated CRM data", createdById: ids.salesMember, status: "PENDING_REVIEW" },
        { id: ids.parkingApproved, organizationId: org.id, teamId: ids.operations, title: "Improve handover checklist", note: "Standardize cross-shift handover", createdById: ids.operationsMember, status: "APPROVED", reviewedById: ids.operationsAdmin, reviewedAt: new Date() },
      ]});

      const quick = await tx.meeting.create({ data: {
        id: ids.quickMeeting, organizationId: org.id, ownerTeamId: ids.sales, title: "Sales Quick Sync", kind: "QUICK_TEAM", status: "SCHEDULED",
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), plannedDurationSeconds: 900, locationType: "ONLINE", onlineLink: "https://meet.example.com/sales-sync",
        organizerId: ids.salesAdmin, createdById: ids.salesAdmin, attendees: { create: [{ userId: ids.salesMember }, { userId: ids.executive }] },
      }});

      const scheduledAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      const structured = await tx.meeting.create({ data: {
        id: ids.structuredMeeting, organizationId: org.id, ownerTeamId: ids.operations, title: "Operations Weekly Review", kind: "STRUCTURED", status: "SCHEDULED",
        scheduledAt, plannedDurationSeconds: 3600, locationType: "HYBRID", roomId: ids.boardroom, onlineLink: "https://meet.example.com/operations-review",
        organizerId: ids.operationsAdmin, createdById: ids.operationsAdmin,
        attendees: { create: [{ userId: ids.secretary }, { userId: ids.operationsMember }] },
        agendaItems: { create: [
          { title: "Metrics review", durationSeconds: 1200, sortOrder: 0, speakers: { create: [{ userId: ids.operationsMember }] } },
          { title: "Operational blockers", durationSeconds: 1800, sortOrder: 1, speakers: { create: [{ userId: ids.operationsAdmin }] } },
        ]},
        bookings: { create: { roomId: ids.boardroom, startsAt: scheduledAt, endsAt: new Date(scheduledAt.getTime() + 3600_000) } },
      }});

      const completedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      await tx.meeting.create({ data: {
        id: ids.completedMeeting, organizationId: org.id, ownerTeamId: ids.sales, title: "Sales Strategy Review", kind: "STRUCTURED", status: "COMPLETED_LOCKED",
        scheduledAt: completedAt, plannedDurationSeconds: 2700, actualDurationSeconds: 2580, locationType: "PHYSICAL", roomId: ids.huddleRoom,
        organizerId: ids.salesAdmin, createdById: ids.salesAdmin, organizerSummary: "Reviewed Q3 targets, aligned on cross-team leads strategy.",
        summarySubmittedAt: new Date(completedAt.getTime() + 3600_000), lockedAt: new Date(completedAt.getTime() + 7200_000), endedAt: completedAt,
        attendees: { create: [{ userId: ids.salesMember }, { userId: ids.operationsMember }] },
        agendaItems: { create: [
          { title: "Q3 target review", durationSeconds: 1200, sortOrder: 0, status: "COMPLETED", actualDurationSeconds: 1140, speakers: { create: [{ userId: ids.salesAdmin }] } },
          { title: "Cross-team strategy", durationSeconds: 900, sortOrder: 1, status: "COMPLETED", actualDurationSeconds: 900, speakers: { create: [{ userId: ids.salesMember }] } },
        ]},
      }});

      await tx.executiveRequest.create({ data: {
        id: ids.executiveRequest, organizationId: org.id, createdByExecutiveId: ids.executive, title: "Board Preparation Meeting",
        description: "Need a meeting to prepare for upcoming board presentation",
        requestedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), preferredPeriod: "MORNING", requestedDurationSeconds: 3600, urgency: "HIGH", status: "OPEN",
        targets: { create: [{ targetType: "TEAM", targetTeamId: ids.sales }] },
      }});

      await tx.notification.createMany({ data: [
        { userId: ids.salesMember, type: "MEETING_INVITATION", title: "Meeting Invitation", body: "You've been invited to Sales Quick Sync" },
        { userId: ids.operationsMember, type: "MEETING_INVITATION", title: "Meeting Invitation", body: "You've been invited to Operations Weekly Review" },
        { userId: ids.salesAdmin, type: "MEETING_REMINDER", title: "Meeting Reminder", body: "Sales Quick Sync starts in 2 days" },
      ]});
    });

    res.json({ ok: true, message: "Demo data seeded successfully" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
