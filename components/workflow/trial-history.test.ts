import { describe, expect, it } from "vitest";
import { activeTrials, deleteTrial, trialCapacity, updateTrialMetadata, TRIAL_LIFETIME, type TrialRetention } from "./trial-history";

const now = Date.UTC(2026, 9, 23);
function round(sequence: number, extra: Partial<TrialRetention> = {}): TrialRetention {
  return { id: `trial-${sequence}`, sequence, createdAt: now, phase: "passed", ...extra };
}
describe("trial history retention policy", () => {
  it("blocks the eleventh run without evicting old rounds; deletion frees exactly one slot", () => {
    const runs = Array.from({ length: 10 }, (_, i) => round(i + 1));
    expect(trialCapacity(runs, now)).toBe(false);
    expect(runs).toHaveLength(10);
    const remaining = deleteTrial(runs, "trial-5");
    expect(remaining).toHaveLength(9);
    expect(trialCapacity(remaining, now)).toBe(true);
    expect(remaining.map((run) => run.sequence)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
  });
  it("expires ordinary rounds at the exact seven-day boundary, while kept rounds survive", () => {
    const ordinary = round(1, { createdAt: now - TRIAL_LIFETIME });
    const kept = round(2, { createdAt: ordinary.createdAt, kept: true });
    expect(activeTrials([ordinary, kept], now - 1)).toHaveLength(2);
    expect(activeTrials([ordinary, kept], now)).toEqual([kept]);
    expect(activeTrials(updateTrialMetadata([kept], kept.id, { kept: false }), now)).toEqual([]);
  });
  it("locks kept and running rounds against deletion, and kept rounds count toward capacity", () => {
    const kept = round(1, { kept: true });
    const running = round(2, { phase: "running" });
    expect(deleteTrial([kept, running], kept.id)).toEqual([kept, running]);
    expect(deleteTrial([kept, running], running.id)).toEqual([kept, running]);
    expect(trialCapacity(Array.from({ length: 10 }, (_, i) => round(i, { kept: true })), now)).toBe(false);
    expect(deleteTrial(updateTrialMetadata([kept], kept.id, { kept: false }), kept.id)).toEqual([]);
  });
  it("updates only the targeted metadata without changing the execution snapshot", () => {
    const runs = [round(1), round(2, { phase: "running" })];
    const updated = updateTrialMetadata(runs, "trial-1", { note: "验证视频标题", kept: true });
    expect(updated[0]).toEqual({ ...runs[0], note: "验证视频标题", kept: true });
    expect(runs[0].note).toBeUndefined();
    expect(updated[1]).toBe(runs[1]);
    expect(updateTrialMetadata(runs, "trial-2", { note: "不可修改" })).toEqual(runs);
  });
});
