import type { LocationType } from "@/types/api";

export type { ApiResponse } from "@/lib/api/client";

export type QuickMeetingDto = {
  title: string;
  ownerTeamId: string;
  plannedDurationSeconds: number;
  scheduledAt?: string;
  locationType: LocationType;
  roomId?: string | null;
  onlineLink?: string | null;
  attendeeIds: string[];
};

export type StructuredAgendaItemDto = {
  title: string;
  durationSeconds: number;
  speakerIds: string[];
  notes?: string | null;
  sortOrder: number;
};

export type StructuredMeetingDto = QuickMeetingDto & {
  agendaItems: StructuredAgendaItemDto[];
  parkingLotItemIds?: string[];
};

export type ExecutiveRequestPlanDto = {
  title: string;
  ownerTeamId: string;
  plannedDurationSeconds: number;
  scheduledAt: string;
  locationType: LocationType;
  roomId?: string | null;
  onlineLink?: string | null;
  attendeeIds: string[];
  agendaItems: StructuredAgendaItemDto[];
  parkingLotItemIds?: string[];
  organizerId?: string | null;
};

export type UpdateMeetingPayload = {
  title?: string;
  scheduledAt?: string;
  locationType?: LocationType;
  roomId?: string | null;
  onlineLink?: string | null;
  plannedDurationSeconds?: number;
};
