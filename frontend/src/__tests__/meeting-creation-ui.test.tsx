import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MeetingCreationForm,
  applyLocationChange,
  creationAccess,
  resetTeamSelections,
  validateAgendaItems,
} from "@/features/meetings/meeting-creation-form";
import { ApiError } from "@/lib/api/client";
import { invalidateMeetingCreationQueries } from "@/lib/api/queries/meetings";
import { calendarKeys, dashboardKeys, meetingKeys, parkingLotKeys, roomKeys } from "@/lib/api/query-keys";

const push = vi.fn();
const quickMutate = vi.fn();
const structuredMutate = vi.fn();
let currentUser: any;

const teamA = "10000000-0000-4000-8000-000000000001";
const teamB = "10000000-0000-4000-8000-000000000002";
const roomId = "30000000-0000-4000-8000-000000000001";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/queries/auth", () => ({ useCurrentUser: () => ({ data: currentUser, isLoading: false }) }));
vi.mock("@/lib/api/queries/meetings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/queries/meetings")>()),
  useCreateQuickMeeting: () => ({ mutateAsync: quickMutate, isPending: false }),
  useCreateStructuredMeeting: () => ({ mutateAsync: structuredMutate, isPending: false }),
}));
vi.mock("@/lib/api/queries/teams", () => ({ useTeams: () => ({ data: [{ id: teamA, name: "Sales" }, { id: teamB, name: "Operations" }] }) }));
vi.mock("@/lib/api/queries/users", () => ({ useUsers: () => ({ data: [
  { id: "20000000-0000-4000-8000-000000000001", name: "Sam", functionalTeamId: teamA, isActive: true },
  { id: "20000000-0000-4000-8000-000000000002", name: "Olivia", functionalTeamId: teamB, isActive: true },
] }) }));
vi.mock("@/lib/api/queries/rooms", () => ({ useRooms: () => ({ data: [{ id: roomId, name: "Boardroom" }] }) }));
vi.mock("@/lib/api/queries/parking-lot", () => ({ useTeamParkingLotItems: () => ({ data: [] }) }));

function admin() {
  return { operationalRole: "TEAM_ADMIN", functionalTeamId: teamA, isExecutive: false };
}

function fillQuickForm() {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Weekly sync" } });
  fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2026-08-10" } });
  fireEvent.change(screen.getByLabelText("Scheduled time"), { target: { value: "09:00" } });
  fireEvent.change(screen.getByLabelText("Room"), { target: { value: roomId } });
}

describe("Phase 2 meeting creation UI", () => {
  beforeEach(() => {
    currentUser = admin();
    push.mockReset();
    quickMutate.mockReset();
    structuredMutate.mockReset();
  });

  it("locks a Team Admin to the profile Functional Team", async () => {
    render(<MeetingCreationForm mode="quick" />);
    const select = await screen.findByLabelText("Owner Team");
    await waitFor(() => expect(select).toHaveValue(teamA));
    expect(select).toBeDisabled();
  });

  it("Secretary cannot submit until a valid Team is selected", () => {
    currentUser = { operationalRole: "SECRETARY", functionalTeamId: null, isExecutive: false };
    render(<MeetingCreationForm mode="quick" />);
    expect(screen.getByRole("button", { name: "Create Meeting" })).toBeDisabled();
  });

  it("team reset clears attendees, speakers, and Parking Lot selections", () => {
    expect(resetTeamSelections({
      attendeeIds: ["u1"],
      agendaItems: [{ title: "A", durationMinutes: 10, speakerIds: ["u1"], notes: "" }],
      parkingLotItemIds: ["p1"],
    })).toEqual({
      attendeeIds: [],
      agendaItems: [{ title: "A", durationMinutes: 10, speakerIds: [], notes: "" }],
      parkingLotItemIds: [],
    });
  });

  it("Quick never renders agenda, speakers, or Parking Lot", () => {
    render(<MeetingCreationForm mode="quick" />);
    expect(screen.queryByTestId("agenda-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("parking-lot-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Speakers")).not.toBeInTheDocument();
  });

  it("Structured validation blocks blank titles and excessive duration", () => {
    expect(validateAgendaItems([{ title: " ", durationMinutes: 10, speakerIds: [], notes: "" }], 30)).toMatch(/title/i);
    expect(validateAgendaItems([{ title: "Review", durationMinutes: 45, speakerIds: [], notes: "" }], 30)).toMatch(/exceeds/i);
  });

  it("location changes clear incompatible values", () => {
    expect(applyLocationChange("PHYSICAL").onlineLink).toBe("");
    expect(applyLocationChange("ONLINE").roomId).toBeNull();
    expect(applyLocationChange("HYBRID")).toMatchObject({ locationType: "HYBRID" });
  });

  it.each([
    [{ operationalRole: "MEMBER", functionalTeamId: teamA, isExecutive: false }, /Members/],
    [{ operationalRole: "MEMBER", functionalTeamId: teamA, isExecutive: true }, /Executives/],
  ])("shows a forbidden state for Member and executive-only identities", (user, message) => {
    currentUser = user;
    render(<MeetingCreationForm mode="quick" />);
    expect(screen.getByTestId("creation-forbidden")).toHaveTextContent(message);
  });

  it("shows ROOM_CONFLICT inline without clearing form state", async () => {
    quickMutate.mockRejectedValue(new ApiError("ROOM_CONFLICT", "Room conflict", { fieldErrors: { roomId: ["Room is already booked"] } }));
    render(<MeetingCreationForm mode="quick" />);
    await waitFor(() => expect(screen.getByLabelText("Owner Team")).toHaveValue(teamA));
    fillQuickForm();
    fireEvent.click(screen.getByRole("button", { name: "Create Meeting" }));
    expect(await screen.findByText("Room is already booked")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Weekly sync");
    expect(screen.getByLabelText("Room")).toHaveValue(roomId);
  });

  it("successful Quick creation routes to its detail page", async () => {
    vi.useFakeTimers();
    quickMutate.mockResolvedValue({ id: "meeting-123" });
    render(<MeetingCreationForm mode="quick" />);
    await vi.waitFor(() => expect(screen.getByLabelText("Owner Team")).toHaveValue(teamA));
    fillQuickForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Meeting" }));
    });
    expect(quickMutate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(push).toHaveBeenCalledWith("/meetings/meeting-123");
    vi.useRealTimers();
  });
});

describe("creation access", () => {
  it("blocks a Team Admin without a Functional Team", () => {
    expect(creationAccess({ operationalRole: "TEAM_ADMIN", functionalTeamId: null, isExecutive: false })).toMatchObject({ allowed: false });
  });

  it("Structured success invalidates meeting, dashboard, calendar, room, and Parking Lot queries", () => {
    const invalidateQueries = vi.fn();
    invalidateMeetingCreationQueries({ invalidateQueries } as never, true);
    for (const queryKey of [meetingKeys.lists(), dashboardKeys.all, calendarKeys.all, roomKeys.all, parkingLotKeys.all]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
    }
  });
});
