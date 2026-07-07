import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  mapExecutiveRequestPlanFormToDto,
  mapQuickMeetingFormToDto,
  mapStructuredMeetingFormToDto,
  mapUpdateMeetingPayload,
  validateAgendaTotal,
} from "@/lib/api/mappers";

const baseForm = {
  title: "Sprint Planning",
  ownerTeamId: "10000000-0000-4000-8000-000000000001",
  plannedDurationMinutes: 60,
  scheduledAt: "2026-07-07T09:00:00.000Z",
  locationType: "PHYSICAL" as const,
  roomId: "30000000-0000-4000-8000-000000000001",
  onlineLink: null,
  attendeeIds: ["20000000-0000-4000-8000-000000000001"],
};

const structuredForm = {
  ...baseForm,
  agendaItems: [{
    title: " Pipeline ",
    durationMinutes: 10,
    speakerIds: ["20000000-0000-4000-8000-000000000001"],
    notes: "",
  }],
  parkingLotItemIds: ["40000000-0000-4000-8000-000000000001"],
};

describe("Phase 1 endpoint DTO mappers", () => {
  it("quick emits only accepted keys", () => {
    const dto = mapQuickMeetingFormToDto(baseForm);
    expect(dto.attendeeIds).toEqual(baseForm.attendeeIds);
    expect(dto.plannedDurationSeconds).toBe(3600);
    expect(dto).not.toHaveProperty("kind");
    expect(dto).not.toHaveProperty("agendaItems");
    expect(dto).not.toHaveProperty("parkingLotItemIds");
  });

  it("structured maps agenda speakers, duration, and sortOrder", () => {
    const dto = mapStructuredMeetingFormToDto(structuredForm);
    expect(dto.agendaItems[0]).toEqual({
      title: "Pipeline",
      durationSeconds: 600,
      speakerIds: structuredForm.agendaItems[0].speakerIds,
      notes: null,
      sortOrder: 0,
    });
    expect(dto).not.toHaveProperty("kind");
  });

  it("request plan uses the structured contract without public organizerId", () => {
    const dto = mapExecutiveRequestPlanFormToDto(structuredForm);
    expect(dto.attendeeIds).toEqual(baseForm.attendeeIds);
    expect(dto).not.toHaveProperty("organizerId");
  });

  it("rejects missing IDs and team names before dispatch", () => {
    expect(() => mapQuickMeetingFormToDto({ ...baseForm, ownerTeamId: "" })).toThrow(/valid team/i);
    expect(() => mapQuickMeetingFormToDto({ ...baseForm, ownerTeamId: "Sales" })).toThrow(/valid team/i);
  });

  it("enforces location combinations before dispatch", () => {
    expect(() => mapQuickMeetingFormToDto({ ...baseForm, roomId: null })).toThrow(/room/i);
    expect(() => mapQuickMeetingFormToDto({ ...baseForm, locationType: "ONLINE", roomId: null, onlineLink: null })).toThrow(/online link/i);
    expect(() => mapQuickMeetingFormToDto({ ...baseForm, locationType: "HYBRID", onlineLink: null })).toThrow(/both/i);
  });

  it("PATCH mapper cannot emit controller-rejected fields", () => {
    const dto = mapUpdateMeetingPayload({ title: " Updated ", plannedDurationMinutes: 30 });
    expect(dto).toEqual({ title: "Updated", plannedDurationSeconds: 1800 });
    for (const field of ["ownerTeamId", "attendeeIds", "agendaItems", "speakerIds", "organizerId", "kind", "executiveRequestId", "status"]) {
      expect(dto).not.toHaveProperty(field);
    }
  });
});

describe("shared API behavior", () => {
  it("ApiError preserves typed validation details", () => {
    const details = { fieldErrors: { ownerTeamId: ["ownerTeamId must be a valid UUID"] } };
    const error = new ApiError("VALIDATION_ERROR", "invalid", details);
    expect(error.details).toEqual(details);
  });

  it("validates agenda totals", () => {
    expect(validateAgendaTotal([{ durationMinutes: 45 }], 30)).toContain("exceeds");
    expect(validateAgendaTotal([{ durationMinutes: 30 }], 30)).toBeNull();
  });
});
