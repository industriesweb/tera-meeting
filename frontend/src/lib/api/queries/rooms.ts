import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { roomKeys } from "@/lib/api/query-keys";
import type { Room, RoomConflict } from "@/types/api";

function fetchRooms(): Promise<Room[]> {
  return unwrap<Room[]>(api.get("rooms"));
}

export function useRooms() {
  return useQuery({
    queryKey: roomKeys.list(),
    queryFn: fetchRooms,
  });
}

function fetchRoom(id: string): Promise<Room> {
  return unwrap<Room>(api.get(`rooms/${id}`));
}

export function useRoom(id: string) {
  return useQuery({
    queryKey: roomKeys.detail(id),
    queryFn: () => fetchRoom(id),
    enabled: !!id,
  });
}

function fetchRoomConflicts(
  roomId: string,
  start: string,
  durationMinutes: number,
  excludeMeetingId?: string
): Promise<RoomConflict[]> {
  const params: Record<string, string> = { roomId, start, durationMinutes: durationMinutes.toString() };
  if (excludeMeetingId) params.excludeMeetingId = excludeMeetingId;
  return unwrap<RoomConflict[]>(api.get("rooms/conflicts", { searchParams: params }));
}

export function useRoomConflicts(roomId: string, start: string, durationMinutes: number, excludeMeetingId?: string) {
  return useQuery({
    queryKey: roomKeys.conflicts(roomId, start, durationMinutes, excludeMeetingId),
    queryFn: () => fetchRoomConflicts(roomId, start, durationMinutes, excludeMeetingId),
    enabled: !!roomId && !!start,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => unwrap<Room>(api.post("rooms", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: roomKeys.lists() }); },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; isActive?: boolean } }) =>
      unwrap<Room>(api.patch(`rooms/${id}`, { json: data })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: roomKeys.lists() });
      qc.invalidateQueries({ queryKey: roomKeys.details() });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<{ deleted: boolean }>(api.delete(`rooms/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: roomKeys.lists() }); },
  });
}
