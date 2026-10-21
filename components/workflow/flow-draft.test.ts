import { describe, expect, it } from "vitest";
import { customFlowV1, customFlow, flowSource } from "./capability-catalog";
import { buildFlowDraft } from "./flow-draft";

describe("forking a selected flow into an editable draft", () => {
  it("copies the selected version, retains origin, remaps bindings and leaves source unchanged", () => {
    const before = JSON.stringify(customFlowV1);
    const draft = buildFlowDraft(customFlowV1, "new-a");
    expect(draft.origin).toEqual({ flowId: customFlowV1.id, version: "V1", name: customFlowV1.name, draftId: "new-a" });
    expect(draft.nodes.find((node) => node.data.operatorId === "vod.transcoding.start")?.data.config["清晰度(选填240p/360p/480p/720p)"]).toBe("720p");
    const preview = draft.nodes.find((node) => node.data.operatorId === "vod.transcoding.get")!;
    expect(preview.data.mappings.vid.sourceNodeId).toBe("new-a:step:2");
    preview.data.config["清晰度(选填240p/360p/480p/720p)"] = "360p";
    expect(JSON.stringify(customFlowV1)).toBe(before);
  });
  it("allocates new identities for each fork and creates editable steps with terminals", () => {
    const a = buildFlowDraft(customFlow, "new-a");
    const b = buildFlowDraft(customFlow, "new-b");
    expect(a.nodes.some((node) => b.nodes.some((other) => other.id === node.id))).toBe(false);
    expect(a.nodes.filter((node) => node.data.operatorId === "control.start")).toHaveLength(1);
    expect(a.nodes.filter((node) => node.data.kind === "result")).toHaveLength(1);
    expect(a.nodes.every((node) => !node.data.readOnly && !node.parentId)).toBe(true);
    expect(a.edges.every((edge) => a.nodes.some((node) => node.id === edge.source) && a.nodes.some((node) => node.id === edge.target))).toBe(true);
  });
  it("does not add a duplicate result when the source already has an end", () => {
    const flow = flowSource.find((item) => item.id === "flow.human-review")!;
    expect(buildFlowDraft(flow, "review").nodes.filter((node) => node.data.kind === "result")).toHaveLength(1);
  });
  it("rejects missing operators or broken source topology instead of making a partial draft", () => {
    expect(() => buildFlowDraft({ ...customFlow, edges: [{ source: "missing", target: "upload" }] }, "bad")).toThrow("失效连线");
    expect(() => buildFlowDraft({ ...customFlow, nodes: [{ ...customFlow.nodes[0], operatorId: "missing" }], edges: [] }, "bad")).toThrow("不可用");
  });
});
