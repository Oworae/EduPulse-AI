import { invokeFunction } from "./function.service.js";

export async function recomputePulse(semesterId) {
  return invokeFunction("recompute-pulse", { semester_id: semesterId });
}

export async function recomputePulseQuietly(semesterId) {
  try { return await recomputePulse(semesterId); }
  catch (error) { console.warn("Academic Pulse refresh deferred:", error.message); return null; }
}
