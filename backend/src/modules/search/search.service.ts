import { prisma } from "../../config/database";

export async function search(userId: string, q: string) {
  const term = q.trim();
  if (!term) return { meetings: [], notes: [] };

  const meetings = await prisma.meeting.findMany({
    where: {
      attendees: { some: { userId } },
      title: { contains: term, mode: "insensitive" },
    },
    select: { id: true, title: true, status: true, scheduledAt: true },
    take: 10,
  });

  const notes = await prisma.meetingNote.findMany({
    where: {
      meeting: { attendees: { some: { userId } } },
      content: { contains: term, mode: "insensitive" },
    },
    select: { id: true, content: true, meetingId: true, meeting: { select: { title: true } } },
    take: 10,
  });

  return { meetings, notes };
}
