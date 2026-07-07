import { prisma } from "../../config/database";

export async function getOrCreateProfile(sub: string, email?: string, name?: string) {
  const existing = await prisma.user.findUnique({
    where: { id: sub },
    include: { organization: true, functionalTeam: { select: { id: true, name: true } } },
  });
  if (existing) return existing;

  const organization = await prisma.organization.findFirst();
  if (!organization) throw new Error("No organization exists. Run setup first.");

  const existingByEmail = email
    ? await prisma.user.findFirst({ where: { email } })
    : null;
  if (existingByEmail) {
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        id: sub,
        name: name || existingByEmail.name || email?.split("@")[0] || "Unknown",
        operationalRole: existingByEmail.operationalRole,
        functionalTeamId: existingByEmail.functionalTeamId,
        isExecutive: existingByEmail.isExecutive,
        isActive: existingByEmail.isActive,
      },
    });
    return prisma.user.findUniqueOrThrow({
      where: { id: sub },
      include: { organization: true, functionalTeam: { select: { id: true, name: true } } },
    });
  }

  const assignSecretary = process.env.FIRST_USER_ROLE_SECRETARY === "true";
  const hasSecretary = assignSecretary
    ? await prisma.user.findFirst({
        where: { organizationId: organization.id, operationalRole: "SECRETARY" },
      })
    : true;

  return prisma.user.create({
    data: {
      id: sub,
      email: email || `${sub}@placeholder.com`,
      name: name || email?.split("@")[0] || "Unknown",
      organizationId: organization.id,
      operationalRole: hasSecretary ? "MEMBER" : "SECRETARY",
    },
    include: { organization: true, functionalTeam: { select: { id: true, name: true } } },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { organization: true, functionalTeam: { select: { id: true, name: true } } },
  });
}
