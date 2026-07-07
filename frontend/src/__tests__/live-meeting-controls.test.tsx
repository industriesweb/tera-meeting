import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LiveMeetingPage from "@/app/(app)/meetings/[id]/live/page";
import type { MeetingDetail, MeetingLiveState, User } from "@/types/api";

const baseMeeting: Partial<MeetingDetail> & Record<string, unknown> = {
  id: "mtg-1",
  title: "Sprint Review",
  status: "SCHEDULED",
  organizerId: "org-1",
  plannedDurationSeconds: 3600,
  organizer: { id: "org-1", name: "Alice", email: "alice@test.com" },
  attendees: [],
  agendaItems: [],
  notes: [],
};

const baseLiveState: Partial<MeetingLiveState> & Record<string, unknown> = {
  meetingId: "mtg-1",
  version: 1,
  serverNow: new Date().toISOString(),
  meetingStatus: "SCHEDULED",
  meetingStartedAt: null,
  plannedDurationSeconds: 3600,
  overtimeStartedAt: null,
  overtimeDeadlineAt: null,
  activeAgendaItemId: null,
  activeItemStartedAt: null,
  activeItemBudgetSeconds: null,
  activeItemExtensionSeconds: 0,
  agendaComplete: false,
};

let mockMeeting: Record<string, unknown> = { ...baseMeeting };
let mockLiveState: Record<string, unknown> = { ...baseLiveState };
let mockCurrentUser: Partial<User> | null = null;
let mockStartMutate = vi.fn();
let mockEndMutate = vi.fn();
let mockSkipMutate = vi.fn();
let mockExtendAgendaMutate = vi.fn();
let mockExtendOvertimeMutate = vi.fn();
let mockTakeoverMutate = vi.fn();
let mockNoteMutate = vi.fn();
let mockNotePending = false;
let mockNoteError: Error | null = null;
let mockSubmitSummaryMutate = vi.fn();
let mockStartPending = false;
let mockEndPending = false;
let mockSkipPending = false;
let mockExtendAgendaPending = false;
let mockExtendOvertimePending = false;
let mockTakeoverPending = false;
let mockSubmitPending = false;

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "mtg-1" }),
}));

vi.mock("@/lib/api/queries/auth", () => ({
  useCurrentUser: () => ({ data: mockCurrentUser, isLoading: false }),
}));

vi.mock("@/lib/api/queries/meetings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/queries/meetings")>()),
  useMeeting: () => ({ data: mockMeeting, isLoading: false }),
  useLiveState: () => ({ data: mockLiveState, isLoading: false }),
  useStartMeeting: () => ({ mutate: mockStartMutate, isPending: mockStartPending, error: null }),
  useEndMeeting: () => ({ mutate: mockEndMutate, isPending: mockEndPending, error: null }),
  useSkipCurrentAgenda: () => ({ mutate: mockSkipMutate, isPending: mockSkipPending, error: null }),
  useExtendCurrentAgenda: () => ({ mutate: mockExtendAgendaMutate, isPending: mockExtendAgendaPending, error: null }),
  useExtendOvertime: () => ({ mutate: mockExtendOvertimeMutate, isPending: mockExtendOvertimePending, error: null }),
  useTakeoverMeeting: () => ({ mutate: mockTakeoverMutate, isPending: mockTakeoverPending, error: null }),
  useSubmitSummary: () => ({ mutate: mockSubmitSummaryMutate, isPending: mockSubmitPending, error: null }),
}));

vi.mock("@/lib/api/queries/notes", () => ({
  useNotes: () => ({ data: mockNotes }),
  useCreateNote: () => ({ mutate: mockNoteMutate, isPending: mockNotePending, error: mockNoteError }),
}));

let mockNotes: any[] = [];

function organizer(): Partial<User> {
  return { id: "org-1", name: "Alice", email: "alice@test.com", operationalRole: "MEMBER" };
}

function secretary(): Partial<User> {
  return { id: "sec-1", name: "Bob", email: "bob@test.com", operationalRole: "SECRETARY" };
}

function updateMeeting(overrides: Record<string, unknown>) {
  mockMeeting = { ...baseMeeting, ...overrides };
}

function updateLiveState(overrides: Record<string, unknown>) {
  mockLiveState = { ...baseLiveState, ...overrides };
}

describe("Live Meeting Controls", () => {
  beforeEach(() => {
    mockMeeting = { ...baseMeeting };
    mockLiveState = { ...baseLiveState };
    mockCurrentUser = null;
    mockStartMutate = vi.fn();
    mockEndMutate = vi.fn();
    mockSkipMutate = vi.fn();
    mockExtendAgendaMutate = vi.fn();
    mockExtendOvertimeMutate = vi.fn();
    mockTakeoverMutate = vi.fn();
    mockSubmitSummaryMutate = vi.fn();
    mockNoteMutate = vi.fn();
    mockNotePending = false;
    mockNoteError = null;
    mockNotes = [];
    mockStartPending = false;
    mockEndPending = false;
    mockSkipPending = false;
    mockExtendAgendaPending = false;
    mockExtendOvertimePending = false;
    mockTakeoverPending = false;
    mockSubmitPending = false;
  });

  it("renders schedule status badge", () => {
    render(<LiveMeetingPage />);
    expect(screen.getByText("SCHEDULED")).toBeInTheDocument();
  });

  describe("Organizer sees Start only for Scheduled meeting", () => {
    it("renders Start Meeting button for organizer when SCHEDULED", () => {
      mockCurrentUser = organizer();
      render(<LiveMeetingPage />);
      expect(screen.getByText("Start Meeting")).toBeInTheDocument();
    });

    it("does not render Start Meeting button when not organizer", () => {
      mockCurrentUser = secretary();
      render(<LiveMeetingPage />);
      expect(screen.queryByText("Start Meeting")).not.toBeInTheDocument();
    });

    it("start mutation calls /meetings/:id/start", () => {
      mockCurrentUser = organizer();
      render(<LiveMeetingPage />);
      screen.getByText("Start Meeting").click();
      expect(mockStartMutate).toHaveBeenCalledWith("mtg-1");
    });

    it("disables Start Meeting button while pending", () => {
      mockCurrentUser = organizer();
      mockStartPending = true;
      render(<LiveMeetingPage />);
      const btn = screen.getByText("Starting...");
      expect(btn).toBeDisabled();
    });
  });

  describe("Secretary sees Take Over where allowed", () => {
    it("renders Take Over for secretary on SCHEDULED", () => {
      mockCurrentUser = secretary();
      render(<LiveMeetingPage />);
      expect(screen.getByText("Take Over")).toBeInTheDocument();
    });

    it("calls takeover mutation with meeting id only (no organizerId in payload)", () => {
      mockCurrentUser = secretary();
      render(<LiveMeetingPage />);
      screen.getByText("Take Over").click();
      expect(mockTakeoverMutate).toHaveBeenCalledWith("mtg-1");
    });

    it("does not render Take Over for organizer (even if secretary role)", () => {
      mockCurrentUser = { id: "org-1", name: "Alice", operationalRole: "SECRETARY" };
      render(<LiveMeetingPage />);
      expect(screen.queryByText("Take Over")).not.toBeInTheDocument();
    });

    it("renders Take Over and End Meeting for secretary on IN_PROGRESS", () => {
      mockCurrentUser = secretary();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Take Over")).toBeInTheDocument();
      expect(screen.getByText("End Meeting")).toBeInTheDocument();
    });
  });

  describe("Completed/Cancelled meetings show no controls", () => {
    it("hides controls when COMPLETED_LOCKED", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "COMPLETED_LOCKED" });
      render(<LiveMeetingPage />);
      expect(screen.queryByText("Start Meeting")).not.toBeInTheDocument();
      expect(screen.queryByText("End Meeting")).not.toBeInTheDocument();
      expect(screen.queryByText("Take Over")).not.toBeInTheDocument();
      expect(screen.queryByText("Skip Current Item")).not.toBeInTheDocument();
    });

    it("hides controls when CANCELLED", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "CANCELLED" });
      render(<LiveMeetingPage />);
      expect(screen.queryByText("Start Meeting")).not.toBeInTheDocument();
      expect(screen.queryByText("End Meeting")).not.toBeInTheDocument();
      expect(screen.queryByText("Take Over")).not.toBeInTheDocument();
    });
  });

  describe("Organizer controls on IN_PROGRESS", () => {
    it("shows Skip Current, +5, +10, +15, and End Meeting for organizer", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Skip Current Item")).toBeInTheDocument();
      expect(screen.getByText("+5")).toBeInTheDocument();
      expect(screen.getByText("+10")).toBeInTheDocument();
      expect(screen.getByText("+15")).toBeInTheDocument();
      expect(screen.getByText("End Meeting")).toBeInTheDocument();
    });

    it("calls skip current mutation", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      screen.getByText("Skip Current Item").click();
      expect(mockSkipMutate).toHaveBeenCalledWith("mtg-1");
    });

    it("calls end meeting mutation", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      screen.getByText("End Meeting").click();
      expect(mockEndMutate).toHaveBeenCalledWith("mtg-1");
    });

    it("calls extend agenda mutations with correct seconds", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      screen.getByText("+5").click();
      expect(mockExtendAgendaMutate).toHaveBeenCalledWith({ meetingId: "mtg-1", seconds: 300 });
      screen.getByText("+10").click();
      expect(mockExtendAgendaMutate).toHaveBeenCalledWith({ meetingId: "mtg-1", seconds: 600 });
      screen.getByText("+15").click();
      expect(mockExtendAgendaMutate).toHaveBeenCalledWith({ meetingId: "mtg-1", seconds: 900 });
    });
  });

  describe("Overtime controls", () => {
    it("shows Extend 5 Minutes and End Meeting for organizer during overtime", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({
        meetingStatus: "IN_PROGRESS",
        meetingStartedAt: new Date().toISOString(),
        overtimeDeadlineAt: new Date(Date.now() + 60000).toISOString(),
      });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Extend 5 Minutes")).toBeInTheDocument();
      expect(screen.getByText("End Meeting")).toBeInTheDocument();
      expect(screen.getByText("Overtime")).toBeInTheDocument();
    });

    it("calls extend overtime mutation", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({
        meetingStatus: "IN_PROGRESS",
        meetingStartedAt: new Date().toISOString(),
        overtimeDeadlineAt: new Date(Date.now() + 60000).toISOString(),
      });
      render(<LiveMeetingPage />);
      screen.getByText("Extend 5 Minutes").click();
      expect(mockExtendOvertimeMutate).toHaveBeenCalledWith({ meetingId: "mtg-1", seconds: 300 });
    });
  });

  describe("Summary controls on ENDED_PENDING_SUMMARY", () => {
    it("shows summary textarea and submit for organizer", () => {
      mockCurrentUser = organizer();
      updateMeeting({ status: "ENDED_PENDING_SUMMARY" });
      render(<LiveMeetingPage />);
      expect(screen.getByPlaceholderText("Write a summary of the meeting...")).toBeInTheDocument();
      expect(screen.getByText("Submit Summary")).toBeInTheDocument();
    });

    it("shows waiting message for secretary", () => {
      mockCurrentUser = secretary();
      updateMeeting({ status: "ENDED_PENDING_SUMMARY" });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Waiting for the organizer to submit the summary.")).toBeInTheDocument();
      expect(screen.queryByText("Submit Summary")).not.toBeInTheDocument();
    });
  });

  describe("Local countdown changes without network calls", () => {
    it("renders timer using countdown values", () => {
      mockCurrentUser = organizer();
      const startedAt = new Date(Date.now() - 60000);
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({
        meetingStatus: "IN_PROGRESS",
        meetingStartedAt: startedAt.toISOString(),
        serverNow: new Date().toISOString(),
      });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Live")).toBeInTheDocument();
      const timer = screen.getByText(/^\d+:\d{2}$/);
      expect(timer).toBeInTheDocument();
    });

    it("does not send network requests from countdown", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      mockCurrentUser = organizer();
      const startedAt = new Date(Date.now() - 60000);
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({
        meetingStatus: "IN_PROGRESS",
        meetingStartedAt: startedAt.toISOString(),
        serverNow: new Date().toISOString(),
      });
      render(<LiveMeetingPage />);
      const fetchCalls = fetchSpy.mock.calls.filter(
        ([url]) => !(url as string).includes("localhost:4000")
      );
      expect(fetchCalls.length).toBe(0);
      fetchSpy.mockRestore();
    });
  });

  describe("One-note workflow", () => {
    it("shows note composer for eligible attendee in IN_PROGRESS", () => {
      mockCurrentUser = { id: "user-1", name: "Charlie", operationalRole: "MEMBER" };
      updateMeeting({ status: "IN_PROGRESS", attendees: [{ userId: "user-1", removedAt: null }], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByPlaceholderText("Write your note...")).toBeInTheDocument();
      expect(screen.getByText("Submit Note")).toBeInTheDocument();
    });

    it("shows note composer for speaker who is not attendee", () => {
      mockCurrentUser = { id: "speaker-1", name: "Speaker", operationalRole: "MEMBER" };
      updateMeeting({
        status: "IN_PROGRESS",
        attendees: [{ userId: "other-user", removedAt: null }],
        agendaItems: [{ speakers: [{ userId: "speaker-1" }] }],
      });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByPlaceholderText("Write your note...")).toBeInTheDocument();
    });

    it("shows 'Your note was submitted' after user has a note", () => {
      mockCurrentUser = { id: "user-1", name: "Charlie", operationalRole: "MEMBER" };
      mockNotes = [{ id: "note-1", authorId: "user-1", content: "My note", author: { id: "user-1", name: "Charlie" } }];
      updateMeeting({ status: "IN_PROGRESS", attendees: [{ userId: "user-1", removedAt: null }], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Your note was submitted")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Write your note...")).not.toBeInTheDocument();
    });

    it("does not show note composer for non-eligible user", () => {
      mockCurrentUser = { id: "stranger", name: "Stranger", operationalRole: "MEMBER" };
      updateMeeting({ status: "IN_PROGRESS", attendees: [{ userId: "other", removedAt: null }], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.queryByPlaceholderText("Write your note...")).not.toBeInTheDocument();
      expect(screen.queryByText("Submit Note")).not.toBeInTheDocument();
    });

    it("does not show note composer after meeting ended", () => {
      mockCurrentUser = { id: "user-1", name: "Charlie", operationalRole: "MEMBER" };
      updateMeeting({ status: "ENDED_PENDING_SUMMARY", attendees: [{ userId: "user-1", removedAt: null }], agendaItems: [] });
      render(<LiveMeetingPage />);
      expect(screen.queryByPlaceholderText("Write your note...")).not.toBeInTheDocument();
    });

    it("organizer sees all notes", () => {
      mockCurrentUser = organizer();
      mockNotes = [
        { id: "n1", authorId: "u1", content: "Note from u1", author: { id: "u1", name: "User 1" } },
        { id: "n2", authorId: "u2", content: "Note from u2", author: { id: "u2", name: "User 2" } },
      ];
      updateMeeting({ status: "IN_PROGRESS", organizerId: "org-1", attendees: [], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Note from u1")).toBeInTheDocument();
      expect(screen.getByText("Note from u2")).toBeInTheDocument();
    });

    it("secretary sees all notes", () => {
      mockCurrentUser = secretary();
      mockNotes = [
        { id: "n1", authorId: "u1", content: "Secret note", author: { id: "u1", name: "User 1" } },
      ];
      updateMeeting({ status: "IN_PROGRESS", organizerId: "org-1", attendees: [], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Secret note")).toBeInTheDocument();
    });

    it("normal attendee sees only own note (backend-filtered)", () => {
      mockCurrentUser = { id: "u1", name: "User 1", operationalRole: "MEMBER" };
      // Simulates backend filtering: only u1's note returned
      mockNotes = [
        { id: "n1", authorId: "u1", content: "My note", author: { id: "u1", name: "User 1" } },
      ];
      updateMeeting({ status: "IN_PROGRESS", organizerId: "org-1", attendees: [{ userId: "u1", removedAt: null }], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("My note")).toBeInTheDocument();
      expect(screen.queryByText("Other note")).not.toBeInTheDocument();
    });

    it("duplicate note returns validation error", () => {
      mockCurrentUser = { id: "user-1", name: "Charlie", operationalRole: "MEMBER" };
      mockNoteError = new Error("You have already submitted a note for this meeting");
      updateMeeting({ status: "IN_PROGRESS", attendees: [{ userId: "user-1", removedAt: null }], agendaItems: [] });
      updateLiveState({ meetingStatus: "IN_PROGRESS", meetingStartedAt: new Date().toISOString() });
      render(<LiveMeetingPage />);
      expect(screen.getByText("You have already submitted a note for this meeting")).toBeInTheDocument();
    });
  });

  describe("Countdown renders locally without network polling", () => {
    it("renders countdown timer from local interval", () => {
      mockCurrentUser = organizer();
      const startedAt = new Date(Date.now() - 120000);
      updateMeeting({ status: "IN_PROGRESS" });
      updateLiveState({
        meetingStatus: "IN_PROGRESS",
        meetingStartedAt: startedAt.toISOString(),
        serverNow: new Date().toISOString(),
        plannedDurationSeconds: 3600,
      });
      render(<LiveMeetingPage />);
      expect(screen.getByText("Live")).toBeInTheDocument();
      const timer = screen.getByText(/^\d+:\d{2}$/);
      expect(timer).toBeInTheDocument();
    });
  });
});
