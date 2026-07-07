// Legacy timer service — all endpoints disabled in controller.
// Kept as stub to avoid import breakage in timer routes module.
export async function getTimerState() {
  throw new Error("Legacy timer disabled");
}

export async function timerAction() {
  throw new Error("Legacy timer disabled");
}
