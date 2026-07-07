import { z } from "zod";

const locationTypeEnum = z.enum(["PHYSICAL", "ONLINE", "HYBRID"]);
const uuid = (field: string) => z.string().uuid(`${field} must be a valid UUID`);
const scheduledAt = z.string().datetime({ offset: true, message: "scheduledAt must be an ISO datetime with offset" });

const locationSuperRefine = <T extends { locationType?: "PHYSICAL" | "ONLINE" | "HYBRID"; roomId?: string | null; onlineLink?: string | null }>(
  data: T,
  ctx: z.RefinementCtx
) => {
  if (!data.locationType) return;
  if (data.locationType === "PHYSICAL") {
    if (!data.roomId) ctx.addIssue({ code: "custom", path: ["roomId"], message: "Room is required for Physical meetings" });
    if (data.onlineLink != null) ctx.addIssue({ code: "custom", path: ["onlineLink"], message: "Online link must be null for Physical meetings" });
  }
  if (data.locationType === "ONLINE") {
    if (!data.onlineLink) ctx.addIssue({ code: "custom", path: ["onlineLink"], message: "Online link is required for Online meetings" });
    if (data.roomId != null) ctx.addIssue({ code: "custom", path: ["roomId"], message: "Room must be null for Online meetings" });
  }
  if (data.locationType === "HYBRID") {
    if (!data.roomId) ctx.addIssue({ code: "custom", path: ["roomId"], message: "Room is required for Hybrid meetings" });
    if (!data.onlineLink) ctx.addIssue({ code: "custom", path: ["onlineLink"], message: "Online link is required for Hybrid meetings" });
  }
};

const endpointCreateFields = {
  title: z.string().trim().min(1, "title is required"),
  ownerTeamId: uuid("ownerTeamId"),
  plannedDurationSeconds: z.number().int().positive(),
  scheduledAt: scheduledAt.optional(),
  locationType: locationTypeEnum,
  roomId: uuid("roomId").optional().nullable(),
  onlineLink: z.string().url().optional().nullable(),
  attendeeIds: z.array(uuid("attendeeIds")).default([]),
};

const agendaItemSchema = z.object({
  title: z.string().trim().min(1, "agenda item title is required"),
  durationSeconds: z.number().int().nonnegative(),
  speakerIds: z.array(uuid("speakerIds")).default([]),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
}).strict();

const agendaTotalRefine = (
  data: { plannedDurationSeconds: number; agendaItems: { durationSeconds: number }[] },
  ctx: z.RefinementCtx,
) => {
  const total = data.agendaItems.reduce((sum, item) => sum + item.durationSeconds, 0);
  if (total > data.plannedDurationSeconds) {
    ctx.addIssue({
      code: "custom",
      path: ["agendaItems"],
      message: "Total agenda duration cannot exceed plannedDurationSeconds",
    });
  }
};

// Deprecated/internal compatibility endpoint. Public clients must use /quick or /structured.
export const createMeetingSchema = z.object({
  ...endpointCreateFields,
  kind: z.enum(["QUICK_TEAM", "STRUCTURED"]).optional().default("QUICK_TEAM"),
  agendaItems: z.array(agendaItemSchema).optional(),
  parkingLotItemIds: z.array(z.string().uuid()).optional(),
}).strict().superRefine(locationSuperRefine);

export const createQuickMeetingSchema = z.object({
  ...endpointCreateFields,
}).strict().superRefine(locationSuperRefine);

export const createStructuredMeetingSchema = z.object({
  ...endpointCreateFields,
  agendaItems: z.array(agendaItemSchema).nonempty("Structured meetings require at least one agenda item"),
  parkingLotItemIds: z.array(z.string().uuid()).optional(),
}).strict().superRefine((data, ctx) => {
  locationSuperRefine(data, ctx);
  agendaTotalRefine(data, ctx);
});

const planMeetingBaseShape = {
  title: z.string().trim().min(1, "title is required"),
  ownerTeamId: uuid("ownerTeamId"),
  plannedDurationSeconds: z.number().int().positive(),
  scheduledAt,
  locationType: locationTypeEnum,
  roomId: uuid("roomId").optional().nullable(),
  onlineLink: z.string().url().optional().nullable(),
  attendeeIds: z.array(uuid("attendeeIds")),
  agendaItems: z.array(agendaItemSchema).nonempty("Structured meetings require at least one agenda item"),
  parkingLotItemIds: z.array(z.string().uuid()).optional(),
};

// Public frontend contract — rejects organizerId, kind, status, organizationId,
// executiveRequestId, createdById via .strict(). Use planExecutiveRequestMeetingInternalSchema
// for Secretary-only organizer override.
export const planExecutiveRequestMeetingSchema = z.object(planMeetingBaseShape)
  .strict()
  .superRefine((data, ctx) => {
    locationSuperRefine(data, ctx);
    agendaTotalRefine(data, ctx);
  });

// Internal/server-only schema with Secretary organizer override.
// Do not expose to normal frontend clients.
export const planExecutiveRequestMeetingInternalSchema = z.object({
  ...planMeetingBaseShape,
  organizerId: uuid("organizerId").optional().nullable(),
})
  .strict()
  .superRefine((data, ctx) => {
    locationSuperRefine(data, ctx);
    agendaTotalRefine(data, ctx);
  });

export const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().optional(),
  locationType: locationTypeEnum.optional(),
  roomId: z.string().uuid().optional().nullable(),
  onlineLink: z.string().url().optional().nullable(),
  ownerTeamId: z.string().uuid().optional(),
  plannedDurationSeconds: z.number().int().positive().optional(),
  agendaItems: z.array(z.object({
    title: z.string().min(1),
    durationSeconds: z.number().int().min(0).default(0),
    speakerIds: z.array(z.string().uuid()).optional(),
    notes: z.string().optional().nullable(),
  })).optional(),
}).strict().superRefine(locationSuperRefine);

export const createRoomSchema = z.object({
  name: z.string().min(1, "name is required"),
});

export const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const availabilityQuerySchema = z.object({
  date: z.string().optional(),
  duration: z.coerce.number().int().positive().default(90),
  userIds: z.array(z.string().uuid()).optional(),
});
