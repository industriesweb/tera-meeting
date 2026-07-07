import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { parkingLotKeys } from "@/lib/api/query-keys";
import type { ParkingLotItem } from "@/types/api";

function fetchMyTeamItems(): Promise<ParkingLotItem[]> {
  return unwrap<ParkingLotItem[]>(api.get("parking-lot/my-team"));
}

export function useMyTeamParkingLotItems() {
  return useQuery({
    queryKey: parkingLotKeys.myTeam(),
    queryFn: fetchMyTeamItems,
  });
}

function fetchTeamItems(teamId: string): Promise<ParkingLotItem[]> {
  return unwrap<ParkingLotItem[]>(api.get(`parking-lot/team/${teamId}`));
}

export function useTeamParkingLotItems(teamId: string) {
  return useQuery({
    queryKey: parkingLotKeys.team(teamId),
    queryFn: () => fetchTeamItems(teamId),
    enabled: !!teamId,
  });
}

function fetchParkingLotItem(id: string): Promise<ParkingLotItem> {
  return unwrap<ParkingLotItem>(api.get(`parking-lot/${id}`));
}

export function useParkingLotItem(id: string) {
  return useQuery({
    queryKey: parkingLotKeys.detail(id),
    queryFn: () => fetchParkingLotItem(id),
    enabled: !!id,
  });
}

type CreateParkingLotItemData = { teamId: string; title: string; note?: string; sourceMeetingId?: string };

export function useCreateParkingLotItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateParkingLotItemData) =>
      unwrap<ParkingLotItem>(api.post("parking-lot", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: parkingLotKeys.all }); },
  });
}

export function useApproveParkingLotItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<ParkingLotItem>(api.post(`parking-lot/${id}/approve`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: parkingLotKeys.all }); },
  });
}

export function useArchiveParkingLotItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<ParkingLotItem>(api.post(`parking-lot/${id}/archive`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: parkingLotKeys.all }); },
  });
}

export function useAddToAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agendaMeetingId }: { id: string; agendaMeetingId: string }) =>
      unwrap<ParkingLotItem>(api.post(`parking-lot/${id}/addToAgenda`, { json: { agendaMeetingId } })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: parkingLotKeys.all }); },
  });
}
