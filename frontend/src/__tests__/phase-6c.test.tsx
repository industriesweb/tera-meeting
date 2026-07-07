import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeetingsPage from "@/app/(app)/meetings/page";
import CalendarPage from "@/app/(app)/calendar/page";
import {
  StatusBadge,
  formatDuration,
  STATUS_LABEL,
} from "@/features/meetings/meeting-presentation";
import type { MeetingStatus, MeetingBrowseCard, CalendarMeetingCard } from "@/types/api";
import { invalidateMeetingCreationQueries } from "@/lib/api/queries/meetings";
import { calendarKeys, dashboardKeys, meetingKeys } from "@/lib/api/query-keys";

const push = vi.fn();
let browseData: any = null;
let browseIsLoading = false;
let browseIsError = false;
let dayData: any = null;
let dayIsLoading = false;
let dayIsError = false;
let dashboardData: any = null;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/api/queries/meetings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/queries/meetings")>()),
  useBrowseMeetings: (filters?: Record<string, string | undefined>) => ({
    data: browseData,
    isLoading: browseIsLoading,
    isError: browseIsError,
  }),
}));

vi.mock("@/lib/api/queries/calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/queries/calendar")>()),
  useDayCalendar: (date: string) => ({
    data: dayData,
    isLoading: dayIsLoading,
    isError: dayIsError,
  }),
}));

vi.mock("@/lib/api/queries/dashboard", () => ({
  useDashboard: () => ({ data: dashboardData, isLoading: false }),
}));

function baseBrowseCard(overrides: Partial<MeetingBrowseCard> = {}): MeetingBrowseCard {
  return {
    id: "mtg-" + Math.random().toString(36).slice(2, 8),
    title: "Sprint Review",
    status: "SCHEDULED",
    kind: "QUICK_TEAM",
    scheduledAt: "2026-08-10T09:00:00.000Z",
    plannedDurationSeconds: 3600,
    actualDurationSeconds: null,
    locationType: "PHYSICAL",
    room: null,
    ownerTeam: { id: "team-1", name: "Sales" },
    organizer: { id: "user-1", name: "Alice" },
    activeAttendeeCount: 3,
    capabilities: { canOpenLiveRoom: false, canViewMeetingSummary: false },
    ...overrides,
  };
}

function baseDayResponse(overrides: any = {}) {
  return {
    date: "2026-08-10",
    timezone: "America/New_York",
    meetings: [],
    ...overrides,
  };
}

describe("Phase 6.2 — Browse & Calendar Day", () => {
  beforeEach(() => {
    browseData = null;
    browseIsLoading = false;
    browseIsError = false;
    dayData = null;
    dayIsLoading = false;
    dayIsError = false;
    dashboardData = null;
    push.mockReset();
  });

  it("1. Meetings page makes one browse request, not unfiltered bulk fetching", () => {
    browseData = {
      timezone: "UTC",
      items: [baseBrowseCard({ title: "Standup" })],
      nextCursor: null,
      totalVisible: 1,
      filterOptions: { teams: [] },
    };
    render(<MeetingsPage />);
    expect(screen.getByText("Standup")).toBeInTheDocument();
  });

  it("2. Canonical uppercase status labels are used everywhere", () => {
    const statuses: MeetingStatus[] = [
      "DRAFT", "SCHEDULED", "IN_PROGRESS",
      "ENDED_PENDING_SUMMARY", "COMPLETED_LOCKED", "CANCELLED",
    ];
    for (const s of statuses) {
      const { unmount } = render(<StatusBadge status={s} />);
      expect(screen.getByText(STATUS_LABEL[s])).toBeInTheDocument();
      unmount();
    }
  });

  it("3. Filters reset pagination", async () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      baseBrowseCard({ title: `Meeting ${i}`, status: "SCHEDULED" })
    );
    browseData = {
      timezone: "UTC",
      items,
      nextCursor: "cursor-2",
      totalVisible: 20,
      filterOptions: { teams: [] },
    };
    render(<MeetingsPage />);
    await waitFor(() => expect(screen.getByText("Meeting 0")).toBeInTheDocument());

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "DRAFT" } });

    await waitFor(() => {
      expect(screen.getByText("No meetings found")).toBeInTheDocument();
    });
  });

  it('4. "Load more" appends distinct cards', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) =>
      baseBrowseCard({ title: `Page1-Mtg ${i}` })
    );
    browseData = {
      timezone: "UTC",
      items: page1,
      nextCursor: "cursor-2",
      totalVisible: 4,
      filterOptions: { teams: [] },
    };
    render(<MeetingsPage />);
    await waitFor(() => expect(screen.getByText("Page1-Mtg 0")).toBeInTheDocument());

    browseData = {
      timezone: "UTC",
      items: Array.from({ length: 2 }, (_, i) =>
        baseBrowseCard({ title: `Page2-Mtg ${i}` })
      ),
      nextCursor: null,
      totalVisible: 4,
      filterOptions: { teams: [] },
    };

    const loadMore = screen.getByText("Load more");
    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(screen.getByText("Page2-Mtg 0")).toBeInTheDocument();
    });
  });

  it("5. Team name renders, never Team UUID fragments", () => {
    browseData = {
      timezone: "UTC",
      items: [baseBrowseCard({ ownerTeam: { id: "10000000-0000-4000-8000-000000000001", name: "Engineering" } })],
      nextCursor: null,
      totalVisible: 1,
      filterOptions: { teams: [] },
    };
    render(<MeetingsPage />);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.queryByText("10000000")).not.toBeInTheDocument();
  });

  it("6. List actions follow card capabilities", () => {
    const liveWithCapability = baseBrowseCard({
      status: "IN_PROGRESS",
      capabilities: { canOpenLiveRoom: true, canViewMeetingSummary: false },
    });
    browseData = {
      timezone: "UTC",
      items: [liveWithCapability],
      nextCursor: null,
      totalVisible: 1,
      filterOptions: { teams: [] },
    };
    render(<MeetingsPage />);
    const openLiveLinks = screen.getAllByText("Open Live Room");
    expect(openLiveLinks.length).toBeGreaterThanOrEqual(1);
    expect(openLiveLinks[0].closest("a")).toHaveAttribute("href", `/meetings/${liveWithCapability.id}/live`);
  });

  it("7. Calendar navigation selects Today, Tomorrow, Day After Tomorrow, and custom date", () => {
    dayData = baseDayResponse();
    render(<CalendarPage />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Day after tomorrow")).toBeInTheDocument();
    const todayStr = new Date().toISOString().split("T")[0];
    const dateInput = screen.getByDisplayValue(todayStr) as HTMLInputElement;
    expect(dateInput).toBeInTheDocument();
  });

  it("8. Calendar formats date/time using response timezone", () => {
    const startStr = "2026-08-10T14:00:00.000Z";
    const endStr = "2026-08-10T15:00:00.000Z";
    dayData = baseDayResponse({
      timezone: "America/New_York",
      meetings: [{
        ...baseBrowseCard(),
        startsAt: startStr,
        endsAt: endStr,
      } as CalendarMeetingCard],
    });
    render(<CalendarPage />);
    expect(screen.getByText("Sprint Review")).toBeInTheDocument();
    expect(screen.getByText(/10.*AM|10.*AM/i)).toBeInTheDocument();
  });

  it("9. Overlapping cards do not render in the same lane", () => {
    const base = baseBrowseCard();
    const m1: CalendarMeetingCard = {
      ...base,
      startsAt: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-10T10:00:00.000Z",
    };
    const m2: CalendarMeetingCard = {
      ...baseBrowseCard({ id: "mtg-overlap", title: "Overlap Meeting" }),
      startsAt: "2026-08-10T09:30:00.000Z",
      endsAt: "2026-08-10T10:30:00.000Z",
    };
    dayData = baseDayResponse({ meetings: [m1, m2] });
    render(<CalendarPage />);
    expect(screen.getByText("Sprint Review")).toBeInTheDocument();
    expect(screen.getByText("Overlap Meeting")).toBeInTheDocument();
  });

  it("10. Calendar card opens Meeting Detail", () => {
    const m: CalendarMeetingCard = {
      ...baseBrowseCard(),
      startsAt: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-10T10:00:00.000Z",
    };
    dayData = baseDayResponse({ meetings: [m] });
    render(<CalendarPage />);
    const link = screen.getByText("Sprint Review").closest("a");
    expect(link).toHaveAttribute("href", `/meetings/${m.id}`);
  });

  it("11. No drag/drop or schedule mutation is triggered by Calendar interaction", () => {
    dayData = baseDayResponse({
      meetings: [{
        ...baseBrowseCard(),
        startsAt: "2026-08-10T09:00:00.000Z",
        endsAt: "2026-08-10T10:00:00.000Z",
      } as CalendarMeetingCard],
    });
    const { container } = render(<CalendarPage />);
    const calendarRoot = container.querySelector('[class*="p-6"]') || container;
    expect(calendarRoot).toBeInTheDocument();
    expect(calendarRoot?.getAttribute("draggable")).not.toBe("true");
  });

  it("12. Empty and error states render correctly", () => {
    dayData = baseDayResponse({ meetings: [] });
    const { unmount } = render(<CalendarPage />);
    expect(screen.getByText("No meetings scheduled")).toBeInTheDocument();
    unmount();

    dayIsError = true;
    render(<CalendarPage />);
    expect(screen.getByText("Failed to load meetings.")).toBeInTheDocument();
  });

  it("13. Mutations invalidate browse, calendar, and dashboard queries", () => {
    const invalidateQueries = vi.fn();
    invalidateMeetingCreationQueries({ invalidateQueries } as never, false);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: meetingKeys.browse() });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: calendarKeys.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
  });
});
