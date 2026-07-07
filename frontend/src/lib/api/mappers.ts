import type {
  ExecutiveRequestPlanDto,
  QuickMeetingDto,
  StructuredAgendaItemDto,
  StructuredMeetingDto,
  UpdateMeetingPayload,
} from "@/lib/api/contracts";
import type { LocationType } from "@/types/api";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BaseMeetingForm = {
  title: string;
  ownerTeamId: string;
  plannedDurationMinutes: number;
  scheduledAt?: string;
  locationType: LocationType;
  roomId?: string | null;
  onlineLink?: string | null;
  attendeeIds: string[];
};

type AgendaItemForm = {
  title: string;
  durationMinutes: number;
  speakerIds: string[];
  notes: string;
};

type StructuredMeetingForm = BaseMeetingForm & {
  agendaItems: AgendaItemForm[];
  parkingLotItemIds?: string[];
};

function assertOwnerTeamId(ownerTeamId: string): void {
  if (!ownerTeamId || !UUID_PATTERN.test(ownerTeamId)) {
    throw new Error("A valid team must be selected before creating a meeting");
  }
}

function assertLocation(form: Pick<BaseMeetingForm, "locationType" | "roomId" | "onlineLink">): void {
  if (form.locationType === "PHYSICAL" && (!form.roomId || form.onlineLink)) {
    throw new Error("Physical meetings require a room and cannot include an online link");
  }
  if (form.locationType === "ONLINE" && (!form.onlineLink || form.roomId)) {
    throw new Error("Online meetings require an online link and cannot include a room");
  }
  if (form.locationType === "HYBRID" && (!form.roomId || !form.onlineLink)) {
    throw new Error("Hybrid meetings require both a room and an online link");
  }
}

function mapBase(form: BaseMeetingForm): QuickMeetingDto {
  assertOwnerTeamId(form.ownerTeamId);
  assertLocation(form);
  return {
    title: form.title.trim(),
    ownerTeamId: form.ownerTeamId,
    plannedDurationSeconds: form.plannedDurationMinutes * 60,
    ...(form.scheduledAt ? { scheduledAt: form.scheduledAt } : {}),
    locationType: form.locationType,
    roomId: form.roomId ?? null,
    onlineLink: form.onlineLink ?? null,
    attendeeIds: form.attendeeIds,
  };
}

function mapAgendaItems(items: AgendaItemForm[]): StructuredAgendaItemDto[] {
  return items
    .filter((item) => item.title.trim())
    .map((item, sortOrder) => ({
      title: item.title.trim(),
      durationSeconds: Math.max(0, Math.round(item.durationMinutes * 60)),
      speakerIds: item.speakerIds,
      notes: item.notes.trim() || null,
      sortOrder,
    }));
}

export function mapQuickMeetingFormToDto(form: BaseMeetingForm): QuickMeetingDto {
  return mapBase(form);
}

export function mapStructuredMeetingFormToDto(form: StructuredMeetingForm): StructuredMeetingDto {
  return {
    ...mapBase(form),
    agendaItems: mapAgendaItems(form.agendaItems),
    ...(form.parkingLotItemIds?.length ? { parkingLotItemIds: form.parkingLotItemIds } : {}),
  };
}

export function mapExecutiveRequestPlanFormToDto(form: StructuredMeetingForm & { scheduledAt: string }): ExecutiveRequestPlanDto {
  assertOwnerTeamId(form.ownerTeamId);
  assertLocation(form);
  return {
    title: form.title.trim(),
    ownerTeamId: form.ownerTeamId,
    plannedDurationSeconds: form.plannedDurationMinutes * 60,
    scheduledAt: form.scheduledAt,
    locationType: form.locationType,
    roomId: form.roomId ?? null,
    onlineLink: form.onlineLink ?? null,
    attendeeIds: form.attendeeIds,
    agendaItems: mapAgendaItems(form.agendaItems),
    ...(form.parkingLotItemIds?.length ? { parkingLotItemIds: form.parkingLotItemIds } : {}),
  };
}

export function mapUpdateMeetingPayload(form: {
  title?: string;
  scheduledAt?: string;
  locationType?: LocationType;
  roomId?: string | null;
  onlineLink?: string | null;
  plannedDurationMinutes?: number;
}): UpdateMeetingPayload {
  const payload: UpdateMeetingPayload = {};
  if (form.title !== undefined) payload.title = form.title.trim();
  if (form.scheduledAt !== undefined) payload.scheduledAt = form.scheduledAt;
  if (form.locationType !== undefined) payload.locationType = form.locationType;
  if (form.roomId !== undefined) payload.roomId = form.roomId ?? null;
  if (form.onlineLink !== undefined) payload.onlineLink = form.onlineLink ?? null;
  if (form.plannedDurationMinutes !== undefined) payload.plannedDurationSeconds = form.plannedDurationMinutes * 60;
  return payload;
}

export function validateAgendaTotal(
  agendaItems: { durationMinutes: number }[],
  plannedDurationMinutes: number,
): string | null {
  const totalMinutes = agendaItems.reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
  return totalMinutes > plannedDurationMinutes
    ? `Total agenda duration (${totalMinutes} min) exceeds meeting duration (${plannedDurationMinutes} min)`
    : null;
}
