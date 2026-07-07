import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { authKeys } from "@/lib/api/query-keys";
import type { User } from "@/types/api";

function fetchMe(): Promise<User> {
  return unwrap<User>(api.get("auth/me"));
}

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: fetchMe,
    retry: false,
  });
}
