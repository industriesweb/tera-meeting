import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { calendarKeys } from "@/lib/api/query-keys";
import type { CalendarWeeklyView, AvailableSlots, Meeting, CalendarDayResponse } from "@/types/api";

function fetchWeeklyView(view?: string, week?: string): Promise<CalendarWeeklyView> {
  const params: Record<string, string> = {};
  if (view) params.view = view;
  if (week) params.week = week;
  return unwrap<CalendarWeeklyView>(api.get("calendar", { searchParams: params }));
}

export function useWeeklyView(view?: string, week?: string) {
  return useQuery({
    queryKey: calendarKeys.weekly(view, week),
    queryFn: () => fetchWeeklyView(view, week),
  });
}

function fetchAvailableSlots(date: string, duration?: number, userIds?: string[]): Promise<AvailableSlots> {
  const params: Record<string, string> = { date };
  if (duration) params.duration = duration.toString();
  if (userIds?.length) params.userIds = userIds.join(",");
  return unwrap<AvailableSlots>(api.get("calendar/slots", { searchParams: params }));
}

export function useAvailableSlots(date: string, duration?: number, userIds?: string[]) {
  return useQuery({
    queryKey: calendarKeys.slots(date, duration),
    queryFn: () => fetchAvailableSlots(date, duration, userIds),
    enabled: !!date,
  });
}

function fetchDraftsNeedingNudge(): Promise<Meeting[]> {
  return unwrap<Meeting[]>(api.get("calendar/drafts/nudge"));
}

export function useDraftsNeedingNudge() {
  return useQuery({
    queryKey: calendarKeys.draftsNudge(),
    queryFn: fetchDraftsNeedingNudge,
  });
}

function fetchDayCalendar(date: string): Promise<CalendarDayResponse> {
  return unwrap<CalendarDayResponse>(api.get("calendar/day", { searchParams: { date } }));
}

export function useDayCalendar(date: string) {
  return useQuery({
    queryKey: calendarKeys.day(date),
    queryFn: () => fetchDayCalendar(date),
    enabled: !!date,
  });
}
