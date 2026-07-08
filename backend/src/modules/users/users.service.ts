import { prisma } from "../../config/database";
import { supabaseAdmin } from "../../config/supabase-admin";
import { env } from "../../config/env";
import { NotFoundError, ForbiddenError, ValidationError } from "../../common/errors/app-error";
import { logAuditEvent } from "../../services/audit.service";
import { sendInvitationEmail } from "../../services/email.service";
import type { OperationalRole } from "@prisma/client";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd + "!Aa1";
}

const userInclude = {
  organization: true,
  functionalTeam: { select: { id: true, name: true } },
} as const;

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: userInclude,
  });
  if (!user) throw new NotFoundError("User");
  return user;
}

export async function listUsers(organizationId: string) {
  return prisma.user.findMany({
    where: { organizationId, isActive: true },
    include: userInclude,
    orderBy: { name: "asc" },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  functionalTeamId?: string | null;
  operationalRole?: OperationalRole;
  isExecutive?: boolean;
  organizationId: string;
  actorId: string;
}) {
  const existing = await prisma.user.findFirst({ where: { email: data.email } });
  if (existing) {
    throw new ValidationError("A user with this email already exists");
  }

  if (data.operationalRole === "TEAM_ADMIN" && !data.functionalTeamId) {
    throw new ValidationError("Team Admin role requires a functional team");
  }

  const password = generateTempPassword();
  const { error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (authError) throw new ValidationError(`Failed to create auth user: ${authError.message}`);

  const user = await prisma.user.create({
    data: {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      functionalTeamId: data.functionalTeamId || null,
      operationalRole: data.operationalRole ?? "MEMBER",
      isExecutive: data.isExecutive ?? false,
      organizationId: data.organizationId,
    },
    include: userInclude,
  });

  await logAuditEvent({
    organizationId: data.organizationId,
    action: "user_created",
    actorId: data.actorId,
    entityType: "user",
    entityId: user.id,
    details: {
      name: data.name,
      email: data.email,
      operationalRole: data.operationalRole ?? "MEMBER",
      isExecutive: data.isExecutive ?? false,
      functionalTeamId: data.functionalTeamId,
    },
  });

  sendInvitationEmail(data.email, password).catch((err) =>
    console.warn("[email] Failed to send invitation:", err.message)
  );

  return { user, tempPassword: password };
}

export async function updateUser(
  id: string,
  data: {
    name?: string;
    operationalRole?: OperationalRole;
    isExecutive?: boolean;
    functionalTeamId?: string | null;
  },
  requestingUserId?: string,
) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User");
  if (!user.isActive) throw new NotFoundError("User");

  if (data.operationalRole === "TEAM_ADMIN" && !data.functionalTeamId && !user.functionalTeamId) {
    throw new ValidationError("Team Admin role requires a functional team");
  }

  if (data.operationalRole !== undefined && user.operationalRole === "SECRETARY" && data.operationalRole !== "SECRETARY") {
    const secretaryCount = await prisma.user.count({
      where: { organizationId: user.organizationId, operationalRole: "SECRETARY", isActive: true, id: { not: id } },
    });
    if (secretaryCount === 0) {
      throw new ValidationError("Cannot demote the last secretary. Promote another user first.");
    }
  }

  if (data.functionalTeamId) {
    const targetTeam = await prisma.functionalTeam.findUnique({ where: { id: data.functionalTeamId } });
    if (!targetTeam || !targetTeam.isActive) throw new NotFoundError("Target team not found");
    if (targetTeam.organizationId !== user.organizationId) {
      throw new ValidationError("Cannot assign user to a team in a different organization");
    }
  }

  const updateData: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  if (data.name !== undefined) { updateData.name = data.name.trim(); changes.name = data.name.trim(); }
  if (data.operationalRole !== undefined) {
    updateData.operationalRole = data.operationalRole;
    changes.operationalRole = { from: user.operationalRole, to: data.operationalRole };
  }
  if (data.isExecutive !== undefined) {
    updateData.isExecutive = data.isExecutive;
    changes.isExecutive = { from: user.isExecutive, to: data.isExecutive };
  }
  if (data.functionalTeamId !== undefined) {
    updateData.functionalTeamId = data.functionalTeamId;
    changes.functionalTeamId = { from: user.functionalTeamId, to: data.functionalTeamId };
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    include: userInclude,
  });

  if (Object.keys(changes).length > 0 && requestingUserId) {
    let eventType = "user_updated";
    if (changes.operationalRole) eventType = "user_role_changed";
    else if (changes.isExecutive) eventType = "user_executive_toggled";
    else if (changes.functionalTeamId) eventType = "user_team_changed";

    await logAuditEvent({
      organizationId: user.organizationId,
      action: eventType,
      actorId: requestingUserId,
      entityType: "user",
      entityId: id,
      details: changes,
    });
  }

  return updated;
}

export async function approveUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User");

  return prisma.user.update({
    where: { id },
    data: { isActive: true },
    include: userInclude,
  });
}
