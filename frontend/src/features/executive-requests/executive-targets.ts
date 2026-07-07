export type TargetMode = "USER" | "TEAM";

export function buildExecutiveTargets(mode: TargetMode, userId: string, teamIds: string[]) {
  if (mode === "USER") {
    if (!userId) throw new Error("Select exactly one target user");
    return [{ targetType: "USER" as const, targetUserId: userId }];
  }
  if (!teamIds.length) throw new Error("Select at least one target Team");
  return [...new Set(teamIds)].map((targetTeamId) => ({ targetType: "TEAM" as const, targetTeamId }));
}
