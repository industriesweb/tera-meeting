import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { executiveRequestKeys, meetingKeys, dashboardKeys, calendarKeys, roomKeys, parkingLotKeys } from "@/lib/api/query-keys";
import type { ExecutiveRequest, MeetingDetail, User } from "@/types/api";
import type { ExecutiveRequestPlanDto } from "@/lib/api/contracts";

function fetchExecutiveRequests(): Promise<ExecutiveRequest[]> {
  return unwrap<ExecutiveRequest[]>(api.get("executive-requests"));
}

export function useExecutiveRequests() {
  return useQuery({
    queryKey: executiveRequestKeys.list(),
    queryFn: fetchExecutiveRequests,
  });
}

function fetchMyExecutiveRequests(): Promise<ExecutiveRequest[]> {
  return unwrap<ExecutiveRequest[]>(api.get("executive-requests/mine"));
}

export function useMyExecutiveRequests() {
  return useQuery({
    queryKey: executiveRequestKeys.mine(),
    queryFn: fetchMyExecutiveRequests,
  });
}

function fetchAssignedExecutiveRequests(): Promise<ExecutiveRequest[]> {
  return unwrap<ExecutiveRequest[]>(api.get("executive-requests/assigned"));
}

export function useAssignedExecutiveRequests() {
  return useQuery({
    queryKey: executiveRequestKeys.assigned(),
    queryFn: fetchAssignedExecutiveRequests,
  });
}

export type ExecutiveInbox = "all" | "mine" | "assigned" | "none";

export function selectExecutiveInbox(user?: Pick<User, "operationalRole" | "isExecutive"> | null): ExecutiveInbox {
  if (!user) return "none";
  if (user.operationalRole === "SECRETARY") return "all";
  if (user.isExecutive) return "mine";
  if (user.operationalRole === "TEAM_ADMIN" || user.operationalRole === "MEMBER") return "assigned";
  return "none";
}

export function useRoleAwareExecutiveRequests(user?: Pick<User, "operationalRole" | "isExecutive"> | null) {
  const inbox = selectExecutiveInbox(user);
  const path = inbox === "all" ? "executive-requests" : inbox === "mine" ? "executive-requests/mine" : "executive-requests/assigned";
  return useQuery({
    queryKey: [...executiveRequestKeys.lists(), inbox],
    queryFn: () => unwrap<ExecutiveRequest[]>(api.get(path)),
    enabled: inbox !== "none",
  });
}

function fetchExecutiveRequest(id: string): Promise<ExecutiveRequest> {
  return unwrap<ExecutiveRequest>(api.get(`executive-requests/${id}`));
}

export function useExecutiveRequest(id: string) {
  return useQuery({
    queryKey: executiveRequestKeys.detail(id),
    queryFn: () => fetchExecutiveRequest(id),
    enabled: !!id,
  });
}

type CreateExecutiveRequestData = {
  title: string;
  description?: string;
  requestedDate: string;
  preferredPeriod?: "MORNING" | "AFTERNOON";
  requestedDurationSeconds?: number;
  urgency?: string;
  targets: { targetType: "USER" | "TEAM"; targetUserId?: string; targetTeamId?: string }[];
};

export function useCreateExecutiveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateExecutiveRequestData) =>
      unwrap<ExecutiveRequest>(api.post("executive-requests", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: executiveRequestKeys.lists() }); },
  });
}

export function useStartPlanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<ExecutiveRequest>(api.post(`executive-requests/${id}/start-planning`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executiveRequestKeys.lists() });
      qc.invalidateQueries({ queryKey: executiveRequestKeys.details() });
    },
  });
}

export function usePlanMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, data }: { requestId: string; data: ExecutiveRequestPlanDto }) =>
      unwrap<MeetingDetail>(api.post(`executive-requests/${requestId}/plan-meeting`, { json: data })),
    onSuccess: () => {
      for (const queryKey of [
        executiveRequestKeys.all,
        meetingKeys.all,
        dashboardKeys.all,
        calendarKeys.all,
        roomKeys.all,
        parkingLotKeys.all,
      ]) qc.invalidateQueries({ queryKey });
    },
  });
}

export function useCancelExecutiveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<ExecutiveRequest>(api.post(`executive-requests/${id}/cancel`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executiveRequestKeys.lists() });
      qc.invalidateQueries({ queryKey: executiveRequestKeys.details() });
    },
  });
}

export function useReturnToPlanning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<ExecutiveRequest>(api.post(`executive-requests/${id}/return-to-planning`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: executiveRequestKeys.lists() });
      qc.invalidateQueries({ queryKey: executiveRequestKeys.details() });
    },
  });
}
