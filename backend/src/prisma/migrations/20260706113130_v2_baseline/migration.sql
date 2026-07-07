-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'ENDED_PENDING_SUMMARY', 'COMPLETED_LOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('QUICK_TEAM', 'STRUCTURED');

-- CreateEnum
CREATE TYPE "OperationalRole" AS ENUM ('MEMBER', 'TEAM_ADMIN', 'SECRETARY');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('PHYSICAL', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "CrossTeamInviteStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MeetingJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ExecutiveRequestStatus" AS ENUM ('OPEN', 'PLANNING', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutiveRequestTargetType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "PreferredPeriod" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "ParkingLotStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'USED_IN_AGENDA', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgendaItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MEETING_INVITATION', 'MEETING_REMINDER', 'MEETING_UPDATED', 'MEETING_CANCELLED', 'ATTENDEE_REMOVED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "functional_teams" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "functional_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "functional_team_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "operational_role" "OperationalRole" NOT NULL DEFAULT 'MEMBER',
    "is_executive" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_bookings" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_team_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MeetingKind" NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "planned_duration_seconds" INTEGER NOT NULL,
    "actual_duration_seconds" INTEGER,
    "location_type" "LocationType" NOT NULL DEFAULT 'PHYSICAL',
    "room_id" UUID,
    "online_link" TEXT,
    "organizer_id" UUID NOT NULL,
    "executive_request_id" UUID,
    "organizer_summary" TEXT,
    "ended_at" TIMESTAMPTZ,
    "summary_submitted_at" TIMESTAMPTZ,
    "locked_at" TIMESTAMPTZ,
    "summary_deadline_at" TIMESTAMPTZ,
    "summary_auto_locked_at" TIMESTAMPTZ,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_timers" (
    "meeting_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ,
    "active_agenda_item_id" UUID,
    "active_item_started_at" TIMESTAMPTZ,
    "overtime_started_at" TIMESTAMPTZ,
    "overtime_deadline_at" TIMESTAMPTZ,
    "overtime_extension_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "meeting_timers_pkey" PRIMARY KEY ("meeting_id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "removed_at" TIMESTAMPTZ,
    "removed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_items" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration_seconds" INTEGER NOT NULL,
    "extension_seconds" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL,
    "status" "AgendaItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "activated_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "skipped_at" TIMESTAMPTZ,
    "actual_duration_seconds" INTEGER,

    CONSTRAINT "agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_item_speakers" (
    "agenda_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "agenda_item_speakers_pkey" PRIMARY KEY ("agenda_item_id","user_id")
);

-- CreateTable
CREATE TABLE "meeting_notes" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "meeting_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_executive_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requested_date" DATE NOT NULL,
    "preferred_period" "PreferredPeriod" NOT NULL DEFAULT 'MORNING',
    "requested_duration_seconds" INTEGER,
    "urgency" TEXT,
    "status" "ExecutiveRequestStatus" NOT NULL DEFAULT 'OPEN',
    "current_meeting_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "executive_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executive_request_targets" (
    "id" UUID NOT NULL,
    "executive_request_id" UUID NOT NULL,
    "target_type" "ExecutiveRequestTargetType" NOT NULL,
    "target_user_id" UUID,
    "target_team_id" UUID,

    CONSTRAINT "executive_request_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_lot_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "source_meeting_id" UUID,
    "status" "ParkingLotStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "agenda_meeting_id" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_lot_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_team_invites" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "invited_user_id" UUID NOT NULL,
    "invited_from_team_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "status" "CrossTeamInviteStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cross_team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_join_requests" (
    "id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "MeetingJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_team_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_agenda_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "meeting_reminder_email" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "functional_teams_organization_id_name_key" ON "functional_teams"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_organization_id_name_key" ON "rooms"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "room_bookings_room_id_meeting_id_key" ON "room_bookings"("room_id", "meeting_id");

-- CreateIndex
CREATE INDEX "meetings_organization_id_status_scheduled_at_idx" ON "meetings"("organization_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "meetings_owner_team_id_scheduled_at_idx" ON "meetings"("owner_team_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_attendees_meeting_id_user_id_key" ON "meeting_attendees"("meeting_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_notes_meeting_id_author_id_key" ON "meeting_notes"("meeting_id", "author_id");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_meeting_id_idx" ON "audit_events"("meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "executive_requests_current_meeting_id_key" ON "executive_requests"("current_meeting_id");

-- CreateIndex
CREATE INDEX "parking_lot_items_team_id_status_idx" ON "parking_lot_items"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cross_team_invites_meeting_id_invited_user_id_key" ON "cross_team_invites"("meeting_id", "invited_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_join_requests_meeting_id_requester_id_key" ON "meeting_join_requests"("meeting_id", "requester_id");

-- AddForeignKey
ALTER TABLE "functional_teams" ADD CONSTRAINT "functional_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_functional_team_id_fkey" FOREIGN KEY ("functional_team_id") REFERENCES "functional_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_team_id_fkey" FOREIGN KEY ("owner_team_id") REFERENCES "functional_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_executive_request_id_fkey" FOREIGN KEY ("executive_request_id") REFERENCES "executive_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_timers" ADD CONSTRAINT "meeting_timers_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_timers" ADD CONSTRAINT "meeting_timers_active_agenda_item_id_fkey" FOREIGN KEY ("active_agenda_item_id") REFERENCES "agenda_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_items" ADD CONSTRAINT "agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item_speakers" ADD CONSTRAINT "agenda_item_speakers_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "agenda_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item_speakers" ADD CONSTRAINT "agenda_item_speakers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_requests" ADD CONSTRAINT "executive_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_requests" ADD CONSTRAINT "executive_requests_created_by_executive_id_fkey" FOREIGN KEY ("created_by_executive_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_requests" ADD CONSTRAINT "executive_requests_current_meeting_id_fkey" FOREIGN KEY ("current_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_request_targets" ADD CONSTRAINT "executive_request_targets_executive_request_id_fkey" FOREIGN KEY ("executive_request_id") REFERENCES "executive_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_request_targets" ADD CONSTRAINT "executive_request_targets_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executive_request_targets" ADD CONSTRAINT "executive_request_targets_target_team_id_fkey" FOREIGN KEY ("target_team_id") REFERENCES "functional_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "functional_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_source_meeting_id_fkey" FOREIGN KEY ("source_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_lot_items" ADD CONSTRAINT "parking_lot_items_agenda_meeting_id_fkey" FOREIGN KEY ("agenda_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_team_invites" ADD CONSTRAINT "cross_team_invites_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_team_invites" ADD CONSTRAINT "cross_team_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_team_invites" ADD CONSTRAINT "cross_team_invites_invited_from_team_id_fkey" FOREIGN KEY ("invited_from_team_id") REFERENCES "functional_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_team_invites" ADD CONSTRAINT "cross_team_invites_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_team_invites" ADD CONSTRAINT "cross_team_invites_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_join_requests" ADD CONSTRAINT "meeting_join_requests_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_join_requests" ADD CONSTRAINT "meeting_join_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_join_requests" ADD CONSTRAINT "meeting_join_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_owner_team_id_fkey" FOREIGN KEY ("owner_team_id") REFERENCES "functional_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_agenda_items" ADD CONSTRAINT "template_agenda_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
