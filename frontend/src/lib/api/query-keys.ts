export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => [...dashboardKeys.all, "summary"] as const,
};

export const meetingKeys = {
  all: ["meetings"] as const,
  lists: () => [...meetingKeys.all, "list"] as const,
  list: (filters?: Record<string, string | undefined>) =>
    [...meetingKeys.lists(), filters].filter((x) => x !== undefined) as readonly string[],
  details: () => [...meetingKeys.all, "detail"] as const,
  detail: (id: string) => [...meetingKeys.details(), id] as const,
  liveState: (id: string) => [...meetingKeys.all, "liveState", id] as const,
  browse: (filters?: Record<string, string | undefined>) =>
    [...meetingKeys.all, "browse", filters].filter((x) => x !== undefined) as readonly string[],
};

export const calendarKeys = {
  all: ["calendar"] as const,
  weekly: (view?: string, week?: string) =>
    [...calendarKeys.all, "weekly", view, week].filter(Boolean) as readonly string[],
  slots: (date?: string, duration?: number) =>
    [...calendarKeys.all, "slots", date, duration?.toString()].filter(Boolean) as readonly string[],
  draftsNudge: () => [...calendarKeys.all, "drafts-nudge"] as const,
  day: (date?: string) => [...calendarKeys.all, "day", date].filter(Boolean) as readonly string[],
};

export const roomKeys = {
  all: ["rooms"] as const,
  lists: () => [...roomKeys.all, "list"] as const,
  list: () => [...roomKeys.lists()] as const,
  details: () => [...roomKeys.all, "detail"] as const,
  detail: (id: string) => [...roomKeys.details(), id] as const,
  conflicts: (roomId: string, start: string, durationMinutes: number, excludeMeetingId?: string) =>
    [...roomKeys.all, "conflicts", roomId, start, durationMinutes.toString(), excludeMeetingId].filter(Boolean) as readonly string[],
};

export const teamKeys = {
  all: ["teams"] as const,
  lists: () => [...teamKeys.all, "list"] as const,
  list: () => [...teamKeys.lists()] as const,
  details: () => [...teamKeys.all, "detail"] as const,
  detail: (id: string) => [...teamKeys.details(), id] as const,
};

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: () => [...userKeys.lists()] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

export const noteKeys = {
  all: ["notes"] as const,
  byMeeting: (meetingId: string) => [...noteKeys.all, "byMeeting", meetingId] as const,
};

export const executiveRequestKeys = {
  all: ["executive-requests"] as const,
  lists: () => [...executiveRequestKeys.all, "list"] as const,
  list: () => [...executiveRequestKeys.lists()] as const,
  mine: () => [...executiveRequestKeys.all, "mine"] as const,
  assigned: () => [...executiveRequestKeys.all, "assigned"] as const,
  details: () => [...executiveRequestKeys.all, "detail"] as const,
  detail: (id: string) => [...executiveRequestKeys.details(), id] as const,
};

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
  preferences: () => [...notificationKeys.all, "preferences"] as const,
};

export const searchKeys = {
  all: ["search"] as const,
  results: (q: string) => [...searchKeys.all, q] as const,
};

export const parkingLotKeys = {
  all: ["parking-lot"] as const,
  myTeam: () => [...parkingLotKeys.all, "my-team"] as const,
  team: (teamId: string) => [...parkingLotKeys.all, "team", teamId] as const,
  details: () => [...parkingLotKeys.all, "detail"] as const,
  detail: (id: string) => [...parkingLotKeys.details(), id] as const,
};

export const auditKeys = {
  all: ["audit"] as const,
  feed: (params?: Record<string, string | undefined>) =>
    [...auditKeys.all, params].filter((x) => x !== undefined) as readonly string[],
};
