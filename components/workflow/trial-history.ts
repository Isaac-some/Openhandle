/** Local prototype policy. Kept rounds still occupy one of the ten slots. */
export const TRIAL_LIMIT = 10;
export const TRIAL_LIFETIME = 7 * 24 * 60 * 60 * 1000;
export type TrialRetention = { id: string; sequence?: number; createdAt: number; kept?: boolean; note?: string; phase: "running" | "passed" | "failed" };

export function activeTrials<T extends TrialRetention>(runs: T[], now = Date.now()): T[] {
  return runs.filter((run) => run.phase === "running" || run.kept || run.createdAt + TRIAL_LIFETIME > now);
}
export function trialCapacity(runs: TrialRetention[], now = Date.now()): boolean {
  return new Set(activeTrials(runs, now).map((run) => run.id)).size < TRIAL_LIMIT;
}
export function updateTrialMetadata<T extends TrialRetention>(runs: T[], id: string, change: { note?: string; kept?: boolean }): T[] {
  return runs.map((run) => run.id === id && run.phase !== "running" ? { ...run, ...change } : run);
}
export function deleteTrial<T extends TrialRetention>(runs: T[], id: string): T[] {
  return runs.filter((run) => run.id !== id || run.kept || run.phase === "running");
}
