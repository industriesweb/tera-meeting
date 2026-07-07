import { Request } from "express";
import { getOrCreateProfile } from "../../modules/auth/auth.service";

export async function resolveOrganizationId(req: Request): Promise<string> {
  if (req.body?.organizationId) return req.body.organizationId;
  if (req.query?.organizationId) return req.query.organizationId as string;

  const user = await getOrCreateProfile(req.user!.sub, req.user!.email);
  return user.organizationId!;
}
