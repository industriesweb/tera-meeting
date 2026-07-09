export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export type MeetingStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "ENDED_PENDING_SUMMARY"
  | "COMPLETED_LOCKED"
  | "CANCELLED";
export type MeetingKind = "QUICK_TEAM" | "STRUCTURED";
export type OperationalRole = "MEMBER" | "TEAM_ADMIN" | "SECRETARY";
export type LocationType = "PHYSICAL" | "ONLINE" | "HYBRID";
export type AgendaItemStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SKIPPED";
export type ExecutiveRequestStatus =
  | "OPEN"
  | "PLANNING"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED";
export type ExecutiveRequestTargetType = "USER" | "TEAM";
export type PreferredPeriod = "MORNING" | "AFTERNOON";
export type ParkingLotStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "USED_IN_AGENDA"
  | "ARCHIVED";
export type NotificationType =
  | "MEETING_INVITATION"
  | "MEETING_REMINDER"
  | "MEETING_UPDATED"
  | "MEETING_CANCELLED"
  | "MEETING_ENDED"
  | "ATTENDEE_REMOVED";
export type CrossTeamInviteStatus = "PENDING" | "APPROVED" | "DECLINED";
export type MeetingJoinRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

export interface Organization {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunctionalTeam {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  members?: User[];
}

export type FunctionalTeamListItem = Omit<FunctionalTeam, "members"> & {
  members: { id: string; name: string }[];
};

export interface User {
  id: string;
  organizationId: string;
  functionalTeamId: string | null;
  name: string;
  email: string;
  operationalRole: OperationalRole;
  isExecutive: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  organization?: Organization;
  functionalTeam?: FunctionalTeam | null;
}

export interface Room {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomBooking {
  id: string;
  roomId: string;
  meetingId: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface MeetingTimer {
  meetingId: string;
  startedAt: string | null;
  activeAgendaItemId: string | null;
  activeItemStartedAt: string | null;
  overtimeStartedAt: string | null;
  overtimeDeadlineAt: string | null;
  overtimeExtensionCount: number;
  version: number;
  updatedAt: string;
}

export interface MeetingAttendee {
  id: string;
  meetingId: string;
  userId: string;
  removedAt: string | null;
  removedById: string | null;
  createdAt: string;
  user?: User;
}

export interface AgendaItemSpeaker {
  agendaItemId: string;
  userId: string;
  user?: User;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  title: string;
  description: string | null;
  durationSeconds: number;
  extensionSeconds: number;
  sortOrder: number;
  status: AgendaItemStatus;
  notes: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  actualDurationSeconds: number | null;
  speakers?: AgendaItemSpeaker[];
}

export interface MeetingNote {
  id: string;
  meetingId: string;
  authorId: string;
  content: string | null;
  createdAt: string;
  author?: { id: string; name: string };
}

export interface Meeting {
  id: string;
  organizationId: string;
  ownerTeamId: string;
  title: string;
  kind: MeetingKind;
  status: MeetingStatus;
  scheduledAt: string | null;
  timezone: string;
  plannedDurationSeconds: number;
  actualDurationSeconds: number | null;
  locationType: LocationType;
  roomId: string | null;
  onlineLink: string | null;
  organizerId: string;
  executiveRequestId: string | null;
  organizerSummary: string | null;
  endedAt: string | null;
  summarySubmittedAt: string | null;
  lockedAt: string | null;
  summaryDeadlineAt: string | null;
  summaryAutoLockedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  creator?: User;
  organizer?: User;
  ownerTeam?: FunctionalTeam;
  room?: Room | null;
  attendees?: MeetingAttendee[];
  agendaItems?: AgendaItem[];
  timer?: MeetingTimer | null;
  bookings?: RoomBooking[];
  notes?: MeetingNote[];
}

type MeetingScalars = Omit<Meeting,
  "creator" | "organizer" | "ownerTeam" | "room" | "attendees" |
  "agendaItems" | "timer" | "bookings" | "notes"
>;

export type MeetingListItem = MeetingScalars & {
  attendees: (MeetingAttendee & { user: User })[];
  agendaItems: AgendaItem[];
  creator: User;
};

export interface MeetingCapabilities {
  canOpenLiveRoom: boolean;
  canManageAttendees: boolean;
  canCancel: boolean;
  canOverrideSchedule: boolean;
  canViewLinkedExecutiveRequest: boolean;
  canViewAllNotes: boolean;
  canViewMeetingSummary: boolean;
}

export interface AgendaItemDetail extends Omit<AgendaItem, "speakers"> {
  speakers: Array<{
    userId: string;
    user: { id: string; name: string };
  }>;
}

export type MeetingDetail = MeetingScalars & {
  attendees: Array<MeetingAttendee & {
    user: Pick<User, "id" | "name" | "operationalRole">;
  }>;
  agendaItems: AgendaItemDetail[];
  timer: MeetingTimer | null;
  bookings: RoomBooking[];
  creator: Pick<User, "id" | "name" | "email">;
  organizer: Pick<User, "id" | "name" | "email">;
  room: Pick<Room, "id" | "name"> | null;
  ownerTeam: { id: string; name: string };
  executiveRequest: {
    id: string;
    title: string;
    status: string;
  } | null;
  capabilities: MeetingCapabilities;
};

export interface DashboardMeetingCard {
  id: string;
  title: string;
  status: MeetingStatus;
  scheduledAt: string | null;
  plannedDurationSeconds: number;
  actualDurationSeconds: number | null;
  ownerTeam: { id: string; name: string };
  activeAttendeeCount: number;
  capabilities: {
    canOpenLiveRoom: boolean;
    canViewMeetingSummary: boolean;
    canSubmitSummary: boolean;
  };
}

export interface DashboardResponse {
  timezone: string;
  todayMeetings: number;
  pendingDrafts: number;
  unreadCount: number;
  nextUpcomingMeeting: DashboardMeetingCard | null;
  liveMeetings: DashboardMeetingCard[];
  summaryActions: DashboardMeetingCard[];
  recentRecords: DashboardMeetingCard[];
  capabilities: {
    canCreateQuickMeeting: boolean;
    canCreateStructuredMeeting: boolean;
    canCreateExecutiveRequest: boolean;
  };
}

export interface MeetingBrowseCard {
  id: string;
  title: string;
  status: MeetingStatus;
  kind: MeetingKind;
  scheduledAt: string | null;
  plannedDurationSeconds: number;
  actualDurationSeconds: number | null;
  locationType: LocationType;
  room: { id: string; name: string } | null;
  ownerTeam: { id: string; name: string };
  organizer: { id: string; name: string };
  activeAttendeeCount: number;
  capabilities: {
    canOpenLiveRoom: boolean;
    canViewMeetingSummary: boolean;
  };
}

export interface MeetingBrowseResponse {
  timezone: string;
  items: MeetingBrowseCard[];
  nextCursor: string | null;
  totalVisible: number;
  filterOptions: {
    teams: Array<{ id: string; name: string }>;
  };
}

export interface CalendarMeetingCard extends MeetingBrowseCard {
  startsAt: string;
  endsAt: string;
}

export interface CalendarDayResponse {
  date: string;
  timezone: string;
  meetings: CalendarMeetingCard[];
}

export interface LiveState {
  meetingId: string;
  version: number;
  serverNow: string;
  meetingStatus: string;
  meetingStartedAt: string | null;
  plannedDurationSeconds: number;
  overtimeStartedAt: string | null;
  overtimeDeadlineAt: string | null;
  activeAgendaItemId: string | null;
  activeItemStartedAt: string | null;
  activeItemBudgetSeconds: number | null;
  activeItemExtensionSeconds: number;
  agendaComplete: boolean;
}

export type MeetingLiveState = LiveState;

export interface CalendarWeeklyView {
  view: string;
  data: Record<
    string,
    CalendarWeeklyMeeting[]
  >;
}

export interface CalendarWeeklyMeeting {
  id: string;
  title: string;
  time: string;
  duration: number;
  status: string;
  youSpeak: boolean;
}

export interface AvailableSlots {
  date: string;
  duration: number;
  slots: {
    time: string;
    endTime: string;
    startMinutes: number;
    available: boolean;
    personConflict: boolean;
    roomConflict: boolean;
    conflictingRoomIds?: string[];
  }[];
}

export interface SearchResponse {
  meetings: {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
  }[];
  notes: {
    id: string;
    content: string | null;
    meetingId: string;
    meeting: { title: string };
  }[];
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreference {
  userId: string;
  meetingReminderEmail: boolean;
  updatedAt: string;
}

export interface ExecutiveRequestTarget {
  id: string;
  executiveRequestId: string;
  targetType: ExecutiveRequestTargetType;
  targetUserId: string | null;
  targetTeamId: string | null;
  targetUser?: { id: string; name: string; functionalTeamId: string | null; functionalTeam?: { id: string; name: string } | null } | null;
  targetTeam?: { id: string; name: string } | null;
}

export interface ExecutiveRequest {
  id: string;
  organizationId: string;
  createdByExecutiveId: string;
  title: string;
  description: string | null;
  requestedDate: string;
  preferredPeriod: PreferredPeriod;
  requestedDurationSeconds: number | null;
  urgency: string | null;
  status: ExecutiveRequestStatus;
  currentMeetingId: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  createdBy?: User;
  currentMeeting?: { id: string; title: string; status: MeetingStatus; scheduledAt: string | null } | null;
  targets?: ExecutiveRequestTarget[];
}

export interface ParkingLotItem {
  id: string;
  organizationId: string;
  teamId: string;
  title: string;
  note: string | null;
  createdById: string;
  sourceMeetingId: string | null;
  status: ParkingLotStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  agendaMeetingId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: User;
  reviewedBy?: User | null;
  team?: FunctionalTeam;
  sourceMeeting?: Meeting | null;
  agendaMeeting?: Meeting | null;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  meetingId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFeedResponse {
  events: (AuditEvent & {
    actorName: string | null;
    occurredAt: string;
  })[];
  nextCursor: string | null;
}

export interface RoomConflict {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

export interface CrossTeamInvite {
  id: string;
  meetingId: string;
  invitedUserId: string;
  invitedFromTeamId: string;
  requestedById: string;
  status: CrossTeamInviteStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  invitedUser?: User;
  requestedBy?: User;
  reviewedBy?: User | null;
  meeting?: Meeting;
}

export interface MeetingJoinRequest {
  id: string;
  meetingId: string;
  requesterId: string;
  status: MeetingJoinRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: User;
  reviewedBy?: User | null;
}
