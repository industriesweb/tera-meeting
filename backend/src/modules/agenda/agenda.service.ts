import { prisma } from "../../config/database";
import { NotFoundError } from "../../common/errors/app-error";

const agendaInclude = {
  speakers: { include: { user: { select: { id: true, name: true } } } },
} as const;

export async function listAgendaItems(meetingId: string) {
  return prisma.agendaItem.findMany({
    where: { meetingId },
    orderBy: { sortOrder: "asc" },
    include: agendaInclude,
  });
}

export async function getAgendaItem(id: string) {
  const item = await prisma.agendaItem.findUnique({
    where: { id },
    include: agendaInclude,
  });
  if (!item) throw new NotFoundError("Agenda item");
  return item;
}

export async function createAgendaItem(
  meetingId: string,
  data: { title: string; durationSeconds?: number; speakerIds?: string[]; notes?: string | null }
) {
  const maxOrder = await prisma.agendaItem.aggregate({
    where: { meetingId },
    _max: { sortOrder: true },
  });

  return prisma.agendaItem.create({
    data: {
      meetingId,
      title: data.title,
      durationSeconds: data.durationSeconds ?? 0,
      notes: data.notes,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      speakers: data.speakerIds?.length
        ? { create: data.speakerIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: agendaInclude,
  });
}

export async function updateAgendaItem(
  id: string,
  data: { title?: string; durationSeconds?: number; speakerIds?: string[]; notes?: string | null; sortOrder?: number }
) {
  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Agenda item");

  const updateData: any = {};
  if (data.title) updateData.title = data.title;
  if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

  if (data.speakerIds !== undefined) {
    await prisma.agendaItemSpeaker.deleteMany({ where: { agendaItemId: id } });
    if (data.speakerIds.length > 0) {
      await prisma.agendaItemSpeaker.createMany({
        data: data.speakerIds.map((userId) => ({ agendaItemId: id, userId })),
      });
    }
  }

  return prisma.agendaItem.update({
    where: { id },
    data: updateData,
    include: agendaInclude,
  });
}

export async function deleteAgendaItem(id: string) {
  const item = await prisma.agendaItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError("Agenda item");

  await prisma.agendaItem.delete({ where: { id } });
  return { deleted: true };
}

export async function reorderItems(meetingId: string, itemIds: string[]) {
  const updates = itemIds.map((id, index) =>
    prisma.agendaItem.update({ where: { id }, data: { sortOrder: index } })
  );
  await prisma.$transaction(updates);
  return listAgendaItems(meetingId);
}
