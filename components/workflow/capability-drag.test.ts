import { describe, expect, it } from "vitest";
import { candidates } from "./capability-catalog";
import { capabilityDragData, resolveCapabilityDrop } from "./capability-drag";
import { selectCapabilityVersion } from "./capability-search";

describe("dragging search results to the canvas", () => {
  it("keeps the exact model identity selected by search", () => {
    const candidate = { ...candidates.find((item) => item.id === "purpose.understanding")!, operatorId: "ai-platform.qwen_tmp1" };
    expect(resolveCapabilityDrop(capabilityDragData(candidate), candidates)?.operatorId).toBe("ai-platform.qwen_tmp1");
  });
  it("keeps an explicitly selected older Flow version", () => {
    const candidate = selectCapabilityVersion(candidates.find((item) => item.id === "custom_video_preview_demo")!, "V1")!;
    const dropped = resolveCapabilityDrop(capabilityDragData(candidate), candidates)!;
    expect(dropped.flow?.version).toBe("V1");
    expect(dropped.flow?.nodes.find((node) => node.operatorId === "vod.transcoding.start")?.config?.["清晰度(选填240p/360p/480p/720p)"]).toBe("720p");
  });
  it("refuses stale versions and a capability revoked after drag start", () => {
    const candidate = candidates.find((item) => item.id === "custom_video_preview_demo")!;
    const value = capabilityDragData(candidate);
    expect(resolveCapabilityDrop(value, [{ ...candidate, authorized: false }])).toBeNull();
    expect(resolveCapabilityDrop(value, [{ ...candidate, available: false }])).toBeNull();
    expect(resolveCapabilityDrop(JSON.stringify({ id: candidate.id, kind: "flow", version: "missing" }), candidates)).toBeNull();
  });
  it("ignores unrelated data and prevents impersonating a different kind or operator", () => {
    expect(resolveCapabilityDrop("plain text", candidates)).toBeNull();
    expect(resolveCapabilityDrop('{"id":"csv.unique","kind":"flow"}', candidates)).toBeNull();
    expect(resolveCapabilityDrop('{"id":"csv.unique","kind":"node","operatorId":"vod.upload"}', candidates)).toBeNull();
  });
});
