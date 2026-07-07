import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeetingDetailPage from "@/app/(app)/meetings/[id]/page";

function baseMeeting(overrides: Record<string, unknown> = {}) {
  return {
    id: "mtg-1",
    title: "Sprint Review",
    status: "SCHEDULED",
    kind: "QUICK_TEAM",
    scheduledAt: "2026-08-10T09:00:00.000Z",
    plannedDurationSeconds: 3600,
    locationType: "PHYSICAL",
    onlineLink: null,
    roomId: null,
    organizerId: "org-1",
    organizerSummary: null,
    endedAt: null,
    summarySubmittedAt: null,
    lockedAt: null,
    executiveRequestId: null,
    createdById: "user-1",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    organizationId: "org-1",
    ownerTeamId: "team-1",
    timezone: "UTC",
    actualDurationSeconds: null,
    summaryDeadlineAt: null,
    summaryAutoLockedAt: null,
    attendees: [],
    agendaItems: [],
    timer: null,
    bookings: [],
    creator: { id: "user-1", name: "Alice", email: "alice@test.com" },
    organizer: { id: "org-1", name: "Alice", email: "alice@test.com" },
    room: null,
    ownerTeam: { id: "team-1", name: "Sales" },
    executiveRequest: null,
    capabilities: {
      canOpenLiveRoom: false,
      canManageAttendees: false,
      canCancel: false,
      canOverrideSchedule: false,
      canViewLinkedExecutiveRequest: false,
      canViewAllNotes: false,
      canViewMeetingSummary: false,
    },
    ...overrides,
  };
}

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "mtg-1" }),
}));

vi.mock("@/lib/api/queries/meetings", () => ({
  useMeeting: () => ({ data: mockMeeting, isLoading: false }),
}));

vi.mock("@/lib/api/queries/auth", () => ({
  useCurrentUser: () => ({ data: { id: "user-1" }, isLoading: false }),
}));

let mockMeeting: Record<string, unknown> = {};

describe("Phase 5.1 — Meeting Detail Page", () => {
  beforeEach(() => {
    mockMeeting = baseMeeting();
  });

  describe("Canonical status badges", () => {
    it.each([
      ["DRAFT", "Draft", "bg-surface-container-high"],
      ["SCHEDULED", "Scheduled", "bg-tertiary-fixed"],
      ["IN_PROGRESS", "Live", "bg-primary/10"],
      ["ENDED_PENDING_SUMMARY", "Summary Pending", "bg-surface-variant"],
      ["COMPLETED_LOCKED", "Completed", "bg-secondary-container"],
      ["CANCELLED", "Cancelled", "bg-error/10"],
    ])("renders status %s as '%s'", (status, label) => {
      mockMeeting = baseMeeting({ status });
      render(<MeetingDetailPage />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it("does NOT render old mixed-case status labels", () => {
      mockMeeting = baseMeeting({ status: "IN_PROGRESS" });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("InProgress")).not.toBeInTheDocument();
    });
  });

  describe("Live-room navigation", () => {
    it("shows Open Live Room when canOpenLiveRoom is true (SCHEDULED)", () => {
      mockMeeting = baseMeeting({
        status: "SCHEDULED",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: true },
      });
      render(<MeetingDetailPage />);
      const links = screen.getAllByText("Open Live Room");
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("Start Meeting")).not.toBeInTheDocument();
    });

    it("shows Open Live Room when canOpenLiveRoom is true (IN_PROGRESS)", () => {
      mockMeeting = baseMeeting({
        status: "IN_PROGRESS",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Open Live Room")).toBeInTheDocument();
    });

    it("hides Open Live Room when canOpenLiveRoom is false", () => {
      mockMeeting = baseMeeting({
        status: "SCHEDULED",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Open Live Room")).not.toBeInTheDocument();
    });

    it("shows View Meeting Summary when canViewMeetingSummary is true", () => {
      mockMeeting = baseMeeting({
        status: "ENDED_PENDING_SUMMARY",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: false, canViewMeetingSummary: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("View Meeting Summary")).toBeInTheDocument();
    });

    it("hides live CTAs for COMPLETED_LOCKED", () => {
      mockMeeting = baseMeeting({
        status: "COMPLETED_LOCKED",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Open Live Room")).not.toBeInTheDocument();
      expect(screen.queryByText("View Meeting Summary")).not.toBeInTheDocument();
    });

    it("hides live CTAs for CANCELLED", () => {
      mockMeeting = baseMeeting({
        status: "CANCELLED",
        capabilities: { ...baseMeeting().capabilities, canOpenLiveRoom: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Open Live Room")).not.toBeInTheDocument();
    });
  });

  describe("Active attendee count", () => {
    it("counts only non-removed attendees", () => {
      mockMeeting = baseMeeting({
        attendees: [
          { id: "a1", meetingId: "mtg-1", userId: "u1", removedAt: null, removedById: null, createdAt: "", user: { id: "u1", name: "Alice", operationalRole: "MEMBER" } },
          { id: "a2", meetingId: "mtg-1", userId: "u2", removedAt: "2026-08-11T00:00:00.000Z", removedById: "org-1", createdAt: "", user: { id: "u2", name: "Bob", operationalRole: "MEMBER" } },
          { id: "a3", meetingId: "mtg-1", userId: "u3", removedAt: null, removedById: null, createdAt: "", user: { id: "u3", name: "Charlie", operationalRole: "MEMBER" } },
        ],
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("2 Members")).toBeInTheDocument();
    });
  });

  describe("Location rendering", () => {
    it("renders PHYSICAL as room name", () => {
      mockMeeting = baseMeeting({
        locationType: "PHYSICAL",
        room: { id: "room-1", name: "Boardroom" },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Boardroom")).toBeInTheDocument();
    });

    it("renders ONLINE as link", () => {
      mockMeeting = baseMeeting({
        locationType: "ONLINE",
        onlineLink: "https://zoom.us/j/123",
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("https://zoom.us/j/123")).toBeInTheDocument();
    });

    it("renders HYBRID as room + online link", () => {
      mockMeeting = baseMeeting({
        locationType: "HYBRID",
        room: { id: "room-1", name: "Boardroom" },
        onlineLink: "https://zoom.us/j/123",
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText(/Boardroom/)).toBeInTheDocument();
      expect(screen.getByText(/https:\/\/zoom.us\/j\/123/)).toBeInTheDocument();
    });
  });

  describe("Agenda speakers from detail response", () => {
    it("renders speaker names from new AgendaItemDetail shape", () => {
      mockMeeting = baseMeeting({
        agendaItems: [{
          id: "ag-1",
          meetingId: "mtg-1",
          title: "Review",
          description: null,
          durationSeconds: 600,
          extensionSeconds: 0,
          sortOrder: 1,
          status: "NOT_STARTED",
          notes: null,
          activatedAt: null,
          completedAt: null,
          skippedAt: null,
          actualDurationSeconds: null,
          speakers: [{ userId: "u1", user: { id: "u1", name: "Alice" } }],
        }],
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText(/Speaker.*Alice/)).toBeInTheDocument();
    });
  });

  describe("Linked Executive Request", () => {
    it("renders ER card when present and capabilities permit", () => {
      mockMeeting = baseMeeting({
        executiveRequest: { id: "er-1", title: "Quarterly Planning", status: "PLANNING" },
        capabilities: { ...baseMeeting().capabilities, canViewLinkedExecutiveRequest: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Linked Executive Request")).toBeInTheDocument();
      expect(screen.getByText("Quarterly Planning")).toBeInTheDocument();
    });

    it("hides ER card when capabilities deny", () => {
      mockMeeting = baseMeeting({
        executiveRequest: { id: "er-1", title: "Quarterly Planning", status: "PLANNING" },
        capabilities: { ...baseMeeting().capabilities, canViewLinkedExecutiveRequest: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Linked Executive Request")).not.toBeInTheDocument();
    });

    it("hides ER card when executiveRequest is null", () => {
      mockMeeting = baseMeeting({ executiveRequest: null });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Linked Executive Request")).not.toBeInTheDocument();
    });
  });

  describe("Organizer summary", () => {
    it("shows summary when present", () => {
      mockMeeting = baseMeeting({ organizerSummary: "We discussed the roadmap." });
      render(<MeetingDetailPage />);
      expect(screen.getByText("We discussed the roadmap.")).toBeInTheDocument();
    });

    it("hides summary section when absent", () => {
      mockMeeting = baseMeeting({ organizerSummary: null });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Summary")).not.toBeInTheDocument();
    });
  });

  describe("Phase 5.2 — Action buttons", () => {
    it("shows Manage Participants when canManageAttendees", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canManageAttendees: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Manage Participants")).toBeInTheDocument();
    });

    it("hides Manage Participants when canManageAttendees is false", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canManageAttendees: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Manage Participants")).not.toBeInTheDocument();
    });

    it("shows Cancel Meeting when canCancel", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canCancel: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Cancel Meeting")).toBeInTheDocument();
    });

    it("hides Cancel Meeting when canCancel is false", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canCancel: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Cancel Meeting")).not.toBeInTheDocument();
    });

    it("shows Override Schedule when canOverrideSchedule", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canOverrideSchedule: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("Override Schedule")).toBeInTheDocument();
    });

    it("hides Override Schedule when canOverrideSchedule is false", () => {
      mockMeeting = baseMeeting({
        capabilities: { ...baseMeeting().capabilities, canOverrideSchedule: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Override Schedule")).not.toBeInTheDocument();
    });

    it("shows canViewMeetingSummary for ENDED_PENDING_SUMMARY when capability is true", () => {
      mockMeeting = baseMeeting({
        status: "COMPLETED_LOCKED",
        capabilities: { ...baseMeeting().capabilities, canViewMeetingSummary: true },
      });
      render(<MeetingDetailPage />);
      expect(screen.getByText("View Meeting Summary")).toBeInTheDocument();
    });

    it("hides View Meeting Summary when canViewMeetingSummary is false", () => {
      mockMeeting = baseMeeting({
        status: "ENDED_PENDING_SUMMARY",
        capabilities: { ...baseMeeting().capabilities, canViewMeetingSummary: false },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("View Meeting Summary")).not.toBeInTheDocument();
    });

    it("does not show action buttons for attendee with no capabilities", () => {
      mockMeeting = baseMeeting({
        capabilities: {
          canOpenLiveRoom: true,
          canManageAttendees: false,
          canCancel: false,
          canOverrideSchedule: false,
          canViewLinkedExecutiveRequest: false,
          canViewAllNotes: false,
          canViewMeetingSummary: false,
        },
      });
      render(<MeetingDetailPage />);
      expect(screen.queryByText("Manage Participants")).not.toBeInTheDocument();
      expect(screen.queryByText("Cancel Meeting")).not.toBeInTheDocument();
      expect(screen.queryByText("Override Schedule")).not.toBeInTheDocument();
    });
  });
});
