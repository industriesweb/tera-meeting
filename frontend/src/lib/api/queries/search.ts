import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { searchKeys } from "@/lib/api/query-keys";
import type { SearchResponse } from "@/types/api";

function fetchSearch(q: string): Promise<SearchResponse> {
  if (!q.trim()) return Promise.resolve({ meetings: [], notes: [] });
  return unwrap<SearchResponse>(api.get("search", { searchParams: { q } }));
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: searchKeys.results(q),
    queryFn: () => fetchSearch(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}
