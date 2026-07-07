import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api/client";
import { noteKeys } from "@/lib/api/query-keys";
import type { MeetingNote } from "@/types/api";

function fetchNotes(meetingId: string): Promise<MeetingNote[]> {
  return unwrap<MeetingNote[]>(api.get(`notes/meeting/${meetingId}`));
}

export function useNotes(meetingId: string) {
  return useQuery({
    queryKey: noteKeys.byMeeting(meetingId),
    queryFn: () => fetchNotes(meetingId),
    enabled: !!meetingId,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ meetingId, content }: { meetingId: string; content?: string }) =>
      unwrap<MeetingNote>(api.post(`notes/meeting/${meetingId}`, { json: { content } })),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: noteKeys.byMeeting(vars.meetingId) });
    },
  });
}
