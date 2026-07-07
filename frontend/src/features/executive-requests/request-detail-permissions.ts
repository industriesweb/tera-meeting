import type { ExecutiveRequest, User } from "@/types/api";

export function requestDetailPermissions(request: ExecutiveRequest, user?: Pick<User, "id" | "operationalRole"> | null) {
  const planningStatus = request.status === "OPEN" || request.status === "PLANNING";
  const userTargets = request.targets?.filter((target) => target.targetType === "USER") ?? [];
  const exactNamedTarget = userTargets.length === 1 && (request.targets?.length ?? 0) === 1 && userTargets[0].targetUserId === user?.id;
  const secretary = user?.operationalRole === "SECRETARY";
  return {
    canStartPlanning: !!secretary && request.status === "OPEN",
    canPlan: planningStatus && (!!secretary || exactNamedTarget),
    canCancel: !!secretary && !request.currentMeetingId,
    exactNamedTarget,
  };
}
