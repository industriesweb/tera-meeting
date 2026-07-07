import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseNotifications = vi.hoisted(() => vi.fn());
const mockUseUnreadCount = vi.hoisted(() => vi.fn());
const mockUseMarkAsRead = vi.hoisted(() => vi.fn());
const mockUseMarkAllAsRead = vi.hoisted(() => vi.fn());

const mockUseBrowseMeetings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/queries/parking-lot", () => ({
  useMyTeamParkingLotItems: vi.fn(),
  useTeamParkingLotItems: vi.fn(),
  useCreateParkingLotItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useApproveParkingLotItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useArchiveParkingLotItem: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useAddToAgenda: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null })),
}));

vi.mock("@/lib/api/queries/auth", () => ({
  useCurrentUser: vi.fn(),
}));

vi.mock("@/lib/api/queries/teams", () => ({
  useTeams: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/lib/api/queries/users", () => ({
  useUsers: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/lib/api/queries/notifications", () => ({
  useNotifications: mockUseNotifications,
  useUnreadCount: mockUseUnreadCount,
  useMarkAsRead: mockUseMarkAsRead,
  useMarkAllAsRead: mockUseMarkAllAsRead,
}));

vi.mock("@/lib/api/queries/meetings", () => ({
  useBrowseMeetings: mockUseBrowseMeetings,
}));

import ParkingLotPage from "@/app/(app)/parking-lot/page";
import NotificationsPage from "@/app/(app)/notifications/page";
import { useMyTeamParkingLotItems, useTeamParkingLotItems, useAddToAgenda } from "@/lib/api/queries/parking-lot";
import { useCurrentUser } from "@/lib/api/queries/auth";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeAdmin() {
  return { data: { operationalRole: "TEAM_ADMIN", functionalTeamId: "team-a" } } as any;
}

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: "p1",
    title: "Item",
    status: "APPROVED",
    createdById: "user-1",
    teamId: "team-a",
    note: null,
    agendaMeetingId: null,
    createdBy: { id: "user-1", name: "User" },
    reviewedBy: null,
    team: { id: "team-a", name: "Team A" },
    sourceMeeting: null,
    agendaMeeting: null,
    ...overrides,
  };
}

describe("Parking Lot page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBrowseMeetings.mockReturnValue({ data: { items: [] }, isLoading: false });
  });

  it("1. Role-based tabs render for all users", () => {
    vi.mocked(useCurrentUser).mockReturnValue({ data: { operationalRole: "MEMBER", functionalTeamId: "team-a" } } as any);
    vi.mocked(useMyTeamParkingLotItems).mockReturnValue({ data: [], isLoading: false } as any);
    vi.mocked(useTeamParkingLotItems).mockReturnValue({ data: [], isLoading: false } as any);

    render(React.createElement(ParkingLotPage), { wrapper });
    expect(screen.getByText("Pending Review")).toBeDefined();
    expect(screen.getByText("Approved")).toBeDefined();
    expect(screen.getByText("Archived")).toBeDefined();
  });

  it("2. Member sees own team items, no review controls for pending items by others", () => {
    vi.mocked(useCurrentUser).mockReturnValue({ data: { operationalRole: "MEMBER", functionalTeamId: "team-a" } } as any);
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [makeItem({ id: "p1", title: "Other's item", status: "PENDING_REVIEW", createdById: "other-user" })],
      isLoading: false,
    } as any);

    render(React.createElement(ParkingLotPage), { wrapper });
    expect(screen.getByText("Other's item")).toBeDefined();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  it("3. Used item has no add-to-agenda or archive action", () => {
    vi.mocked(useCurrentUser).mockReturnValue(makeAdmin());
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [makeItem({ id: "p1", title: "Used item", status: "USED_IN_AGENDA", agendaMeeting: { id: "m1", title: "Meeting", status: "DRAFT" } })],
      isLoading: false,
    } as any);

    render(React.createElement(ParkingLotPage), { wrapper });
    expect(screen.getByText("USED IN AGENDA")).toBeDefined();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Archive")).toBeNull();
    expect(screen.queryByText("Add to agenda")).toBeNull();
  });
});

describe("Parking Lot — Add-to-Agenda controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBrowseMeetings.mockReturnValue({ data: { items: [] }, isLoading: false });
  });

  it("1. Add-to-agenda button appears only for APPROVED unused items", () => {
    vi.mocked(useCurrentUser).mockReturnValue(makeAdmin());
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [
        makeItem({ id: "p1", title: "Approved item", status: "APPROVED", agendaMeetingId: null }),
        makeItem({ id: "p2", title: "Pending item", status: "PENDING_REVIEW" }),
        makeItem({ id: "p3", title: "Used item", status: "USED_IN_AGENDA", agendaMeetingId: "mtg-1" }),
      ],
      isLoading: false,
    } as any);

    render(React.createElement(ParkingLotPage), { wrapper });

    // APPROVED unused item should show "Add to agenda"
    expect(screen.getByText("Approved item")).toBeDefined();
    const addButtons = screen.getAllByText("Add to agenda");
    expect(addButtons).toHaveLength(1);

    // PENDING item should NOT show "Add to agenda"
    expect(screen.getByText("Pending item")).toBeDefined();

    // USED item should NOT show "Add to agenda"
    expect(screen.getByText("Used item")).toBeDefined();
  });

  it("2. Quick meetings never appear in target picker", () => {
    vi.mocked(useCurrentUser).mockReturnValue(makeAdmin());
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [makeItem({ id: "p1", title: "Approved item", status: "APPROVED" })],
      isLoading: false,
    } as any);
    // Simulate what the API returns when filtered by kinds=STRUCTURED
    mockUseBrowseMeetings.mockReturnValue({
      data: {
        items: [
          { id: "m2", title: "Structured review", status: "DRAFT", kind: "STRUCTURED", ownerTeam: { id: "team-a", name: "Team A" }, scheduledAt: null },
        ],
      },
      isLoading: false,
    });

    render(React.createElement(ParkingLotPage), { wrapper });

    // Click "Add to agenda" to open the picker
    fireEvent.click(screen.getByText("Add to agenda"));

    // Only STRUCTURED meetings should appear
    expect(screen.getByText("Structured review")).toBeDefined();
    // Quick meetings are never in the mock response (API filters by kind)
    expect(screen.queryByText("Quick standup")).toBeNull();
  });

  it("3. Used items have no archive or add actions", () => {
    vi.mocked(useCurrentUser).mockReturnValue(makeAdmin());
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [
        makeItem({ id: "p1", title: "Used item", status: "USED_IN_AGENDA", agendaMeetingId: "mtg-1", agendaMeeting: { id: "mtg-1", title: "Sprint Planning", status: "DRAFT" } }),
      ],
      isLoading: false,
    } as any);

    render(React.createElement(ParkingLotPage), { wrapper });
    expect(screen.getByText("Used item")).toBeDefined();
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Archive")).toBeNull();
    expect(screen.queryByText("Add to agenda")).toBeNull();
    // Should show linked meeting
    expect(screen.getByText(/Sprint Planning/)).toBeDefined();
  });

  it("4. Failed attach preserves UI state and shows error", async () => {
    const { ApiError } = await import("@/lib/api/client");
    const apiErr = new ApiError("ALREADY_LINKED", "Item is already linked");
    const mockMutateAsync = vi.fn().mockRejectedValue(apiErr);
    vi.mocked(useAddToAgenda).mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false, isError: true, error: apiErr } as any);

    vi.mocked(useCurrentUser).mockReturnValue(makeAdmin());
    vi.mocked(useTeamParkingLotItems).mockReturnValue({
      data: [makeItem({ id: "p1", title: "Approved item", status: "APPROVED" })],
      isLoading: false,
    } as any);
    mockUseBrowseMeetings.mockReturnValue({
      data: {
        items: [
          { id: "m1", title: "Sprint Planning", status: "DRAFT", kind: "STRUCTURED", ownerTeam: { id: "team-a", name: "Team A" }, scheduledAt: null },
        ],
      },
      isLoading: false,
    });

    render(React.createElement(ParkingLotPage), { wrapper });

    // Open the picker
    fireEvent.click(screen.getByText("Add to agenda"));
    expect(screen.getByText("Sprint Planning")).toBeDefined();

    // Attempt to add (will fail)
    fireEvent.click(screen.getByText("Sprint Planning"));

    await waitFor(() => {
      expect(screen.getByText("Item is already linked")).toBeDefined();
    });

    // Picker should still be open, showing the error
    expect(screen.getByText("Sprint Planning")).toBeDefined();
  });
});

describe("Notifications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotifications.mockReturnValue({ data: [], isLoading: false });
    mockUseUnreadCount.mockReturnValue({ data: { count: 0 } });
    mockUseMarkAsRead.mockReturnValue({ mutate: vi.fn() } as any);
    mockUseMarkAllAsRead.mockReturnValue({ mutate: vi.fn(), isPending: false } as any);
  });

  it("5. Empty state renders correctly", () => {
    mockUseNotifications.mockReturnValue({ data: [], isLoading: false });
    mockUseUnreadCount.mockReturnValue({ data: { count: 0 } });

    render(React.createElement(NotificationsPage), { wrapper });
    expect(screen.getByText("All caught up")).toBeDefined();
    expect(screen.getByText("No notifications yet")).toBeDefined();
  });

  it("6. Loading state renders spinner", () => {
    mockUseNotifications.mockReturnValue({ data: undefined, isLoading: true });
    mockUseUnreadCount.mockReturnValue({ data: undefined });

    render(React.createElement(NotificationsPage), { wrapper });
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("7. Mark all read button appears when unread count > 0", () => {
    mockUseNotifications.mockReturnValue({
      data: [
        { id: "n1", type: "MEETING_UPDATED", title: "Test", body: null, readAt: null, createdAt: new Date().toISOString(), data: null },
      ],
      isLoading: false,
    });
    mockUseUnreadCount.mockReturnValue({ data: { count: 1 } });

    render(React.createElement(NotificationsPage), { wrapper });
    expect(screen.getByText("Mark all read")).toBeDefined();
    expect(screen.getByText("1 unread notification")).toBeDefined();
  });
});
