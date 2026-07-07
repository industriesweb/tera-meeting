import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { userKeys } from "@/lib/api/query-keys";
import type { User } from "@/types/api";

function fetchUsers(): Promise<User[]> {
  return unwrap<User[]>(api.get("users"));
}

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: fetchUsers,
  });
}

function fetchUser(id: string): Promise<User> {
  return unwrap<User>(api.get(`users/${id}`));
}

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => fetchUser(id),
    enabled: !!id,
  });
}

type CreateUserData = {
  name: string;
  email: string;
  functionalTeamId?: string;
  operationalRole?: string;
  isExecutive?: boolean;
};

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserData) => unwrap<User>(api.post("users", { json: data })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: userKeys.lists() }); },
  });
}

type UpdateUserData = {
  name?: string;
  operationalRole?: string;
  isExecutive?: boolean;
  functionalTeamId?: string | null;
};

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserData }) =>
      unwrap<User>(api.patch(`users/${id}`, { json: data })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      qc.invalidateQueries({ queryKey: userKeys.details() });
    },
  });
}

export function useApproveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap<User>(api.post(`users/${id}/approve`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() });
      qc.invalidateQueries({ queryKey: userKeys.details() });
    },
  });
}
