import { Request, Response } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { resolveOrganizationId } from "../../common/utils/resolve-organization";
import { getPolicyUser, requireSecretary } from "../../policies/access-policy";
import { listAuditFeed } from "../../services/audit.service";
import type { AuditFeedQuery } from "../../services/audit.service";

export const getAuditEvents = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getPolicyUser(req.user!.sub);
  requireSecretary(actor, "view audit timeline");
  const organizationId = await resolveOrganizationId(req);

  const query: AuditFeedQuery = {
    cursor: req.query.cursor as string | undefined,
    limit: Math.min(parseInt(req.query.limit as string) || 50, 200),
    action: req.query.action as string | undefined,
    actorId: req.query.actorId as string | undefined,
    entityType: req.query.entityType as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
  };

  const result = await listAuditFeed(organizationId, query);
  res.json(result);
});
