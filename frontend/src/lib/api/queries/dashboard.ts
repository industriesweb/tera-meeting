import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { dashboardKeys } from "@/lib/api/query-keys";
import type { DashboardResponse } from "@/types/api";

function fetchDashboard(): Promise<DashboardResponse> {
  return unwrap<DashboardResponse>(api.get("dashboard"));
}

export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchDashboard,
  });
}
