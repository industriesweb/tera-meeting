import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { teamKeys } from "@/lib/api/query-keys";
import type { FunctionalTeam, FunctionalTeamListItem, User } from "@/types/api";

function fetchTeams(): Promise<FunctionalTeamListItem[]> {
  return unwrap<FunctionalTeamListItem[]>(api.get("teams"));
}

export function useTeams() {
  return useQuery({
    queryKey: teamKeys.list(),
    queryFn: fetchTeams,
  });
}

function fetchTeam(id: string): Promise<FunctionalTeam> {
  return unwrap<FunctionalTeam>(api.get(`teams/${id}`));
}

export function useTeam(id: string) {
  return useQuery({
    queryKey: teamKeys.detail(id),
    queryFn: () => fetchTeam(id),
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string }) => unwrap<FunctionalTeam>(api.post("teams", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.lists() }); },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string } }) =>
      unwrap<FunctionalTeam>(api.patch(`teams/${id}`, { json: data })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.lists() });
      qc.invalidateQueries({ queryKey: teamKeys.details() });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<{ deleted: boolean }>(api.delete(`teams/${id}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.lists() }); },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) =>
      unwrap<User>(api.post(`teams/${teamId}/members`, { json: { userId } })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.details() }); },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) =>
      unwrap<User>(api.delete(`teams/${teamId}/members/${userId}`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.details() }); },
  });
}
