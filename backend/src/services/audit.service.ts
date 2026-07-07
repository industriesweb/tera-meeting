import { prisma } from "../config/database";

export interface AuditFeedQuery {
  cursor?: string;
  limit?: number;
  action?: string;
  actorId?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NormalizedEvent {
  id: string;
  action: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  entityType: string;
  entityId: string | null;
  meetingId: string | null;
  details: Record<string, unknown>;
}

interface CursorData {
  occurredAt: string;
  lastId: string;
}

function encodeCursor(ts: Date, id: string): string {
  return Buffer.from(JSON.stringify({ occurredAt: ts.toISOString(), lastId: id })).toString("base64");
}

function decodeCursor(raw: string): CursorData | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString());
  } catch {
    return null;
  }
}

export async function logAuditEvent(params: {
  organizationId: string;
  action: string;
  actorId?: string;
  entityType: string;
  entityId?: string;
  meetingId?: string;
  details?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({ data: params as any });
}

export async function listAuditFeed(
  organizationId: string,
  query: AuditFeedQuery,
): Promise<{ events: NormalizedEvent[]; nextCursor: string | null }> {
  const limit = Math.min(query.limit ?? 50, 200);
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;

  const where: any = { organizationId };
  if (query.action) where.action = query.action;
  if (query.actorId) where.actorId = query.actorId;
  if (query.entityType) where.entityType = query.entityType;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const normalized: NormalizedEvent[] = events.map((e) => ({
    id: e.id,
    action: e.action,
    occurredAt: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorName: null,
    entityType: e.entityType,
    entityId: e.entityId,
    meetingId: e.meetingId,
    details: (e.details as Record<string, unknown>) ?? {},
  }));

  let startIdx = 0;
  if (cursor) {
    startIdx = normalized.findIndex(
      (e) => e.occurredAt === cursor.occurredAt && e.id === cursor.lastId,
    );
    if (startIdx >= 0) startIdx += 1;
  }

  const page = normalized.slice(startIdx, startIdx + limit);
  const nextCursor =
    normalized.length > startIdx + limit && page.length > 0
      ? encodeCursor(new Date(page[page.length - 1].occurredAt), page[page.length - 1].id)
      : null;

  const actorIds = new Set<string>();
  for (const e of page) {
    if (e.actorId) actorIds.add(e.actorId);
  }
  if (actorIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...actorIds] } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));
    for (const e of page) {
      if (e.actorId) e.actorName = nameMap.get(e.actorId) ?? null;
    }
  }

  return { events: page, nextCursor };
}
