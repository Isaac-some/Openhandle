import { describe, expect, it } from "vitest";
import { getOperator, createNode } from "@/app/lib/workflow";
import { createTrialSample, retainTrial, simulateTrial, trialResultNodes, trialValueAt, type TrialNode } from "./trial-run";

const sample = createTrialSample({ id: "video-a", name: "跑步视频.mov", source: "platform", type: "video/quicktime", previewUrl: "http://localhost/video.mov" });
function node(id: string, operatorId: string, extra: Partial<TrialNode> = {}): TrialNode {
  const operator = getOperator(operatorId)!;
  return { id, label: operator.name, operatorId, kind: operator.kind, inputs: operator.inputs, outputs: operator.outputs, config: createNode(operator, id, { x: 0, y: 0 }).data.config, mappings: {}, ...extra };
}
function graph() {
  return [
    node("start", "control.start", { outputs: getOperator("vod.upload.tos")!.inputs }),
    node("transfer", "vod.upload.tos", { mappings: { vid: { sourceType: "upstream", sourceNodeId: "start", sourceField: "vid" } } }),
    node("ai", "ai-platform.gemini", { mappings: { tos_path: { sourceType: "upstream", sourceNodeId: "transfer", sourceField: "tos_path" } }, outputShape: [{ key: "title", type: "String", required: true, description: "视频标题" }] }),
    node("end", "control.result"),
  ];
}
const edges = [{ source: "start", target: "transfer" }, { source: "transfer", target: "ai" }, { source: "ai", target: "end" }];

describe("snapshot-bound local trial records", () => {
  it("retains multiple rounds and replaces only the matching round with a detached snapshot", () => {
    const first = { id: "trial-1", ...simulateTrial(graph(), edges, sample) };
    const history = retainTrial([], first);
    first.records.ai.config.提示词 = "后来修改的配置";
    expect(history[0].records.ai.config.提示词).not.toBe("后来修改的配置");
    const second = { id: "trial-2", ...simulateTrial(graph(), edges, { ...sample, name: "第二条视频.mov" }) };
    const both = retainTrial(history, second);
    const updated = retainTrial(both, second);
    expect(updated.map((run) => run.id)).toEqual(["trial-2", "trial-1"]);
    expect(trialValueAt(updated[1].records.ai.outputs, "gemini_output.title")).toContain("跑步视频.mov");
    expect(trialValueAt(updated[0].records.ai.outputs, "gemini_output.title")).toContain("第二条视频.mov");
  });
  it("resolves dependencies independently of canvas array order and retains actual mapped values", () => {
    const nodes = graph();
    const { records, order } = simulateTrial([...nodes].reverse(), edges, sample);
    expect(order).toEqual(["start", "transfer", "ai", "end"]);
    expect(records.transfer.inputs.vid).toBe("video-a");
    expect(records.ai.inputs.tos_path).toBe(records.transfer.outputs?.tos_path);
    expect(trialValueAt(records.ai.outputs, "gemini_output.title")).toContain("跑步视频.mov");
    expect(Object.values(records).every((record) => record.status === "succeeded")).toBe(true);
  });
  it("honors renamed columns, primitive types, enums and Qwen's unwrapped output", () => {
    const qwen = node("qwen", "ai-platform.qwen_tmp1", { config: { 模型: "qwen3.5-plus" }, outputShape: [
      { key: "headline", type: "String", required: true, description: "标题" },
      { key: "count", type: "Int", required: true, description: "数量" },
      { key: "score", type: "Float", required: true, description: "评分" },
      { key: "accepted", type: "Boolean", required: true, description: "是否通过" },
      { key: "category", type: "String", required: true, description: "分类", choices: ["体育", "生活"] },
    ] });
    const record = simulateTrial([qwen], [], sample).records.qwen;
    expect(record.config.模型).toBe("qwen3.5-plus");
    expect(record.outputs).toMatchObject({ count: 1, score: 0.95, accepted: true, category: "体育" });
    expect(record.outputs?.headline).toContain("跑步视频.mov");
    expect(record.outputs).not.toHaveProperty("title");
    expect(record.outputs).not.toHaveProperty("undefined");
  });
  it("keeps records immutable when the draft, sample or next run changes", () => {
    const nodes = graph();
    const first = simulateTrial(nodes, edges, sample);
    const before = structuredClone(first);
    nodes[2].outputShape![0].key = "renamed";
    nodes[2].config.提示词 = "改过的提示词";
    const second = simulateTrial(nodes, edges, { ...sample, name: "另一个视频.mov", values: { ...sample.values, vid: "video-b" } });
    expect(first).toEqual(before);
    expect(second.records.transfer.inputs.vid).toBe("video-b");
    expect(second.records.ai.outputs?.gemini_output).toHaveProperty("renamed");
  });
  it("expands configuration references from this run's inputs and upstream outputs", () => {
    const nodes = graph();
    nodes[2].config.提示词 = "标注 {ai.inputs.tos_path}，原文件 {start.outputs.vid}";
    const records = simulateTrial(nodes, edges, sample).records;
    expect(records.ai.config.提示词).toBe(`标注 ${records.transfer.outputs?.tos_path}，原文件 video-a`);
    expect(nodes[2].config.提示词).toContain("{ai.inputs.tos_path}");
  });
  it("does not invent missing input values or success for unsupported operators", () => {
    const missing = graph(); delete missing[1].mappings.vid;
    const failed = simulateTrial(missing, edges, sample).records;
    expect(failed.transfer.status).toBe("failed");
    expect(failed.transfer.outputs).toBeUndefined();
    expect(failed.ai.status).toBe("unexecuted");
    expect(failed.ai.outputs).toBeUndefined();
    const unsupported = simulateTrial([node("csv", "csv.unique", { inputs: [] })], [], sample).records.csv;
    expect(unsupported.status).toBe("failed");
    expect(unsupported.error).toContain("尚未提供本地演示数据");
  });
  it("preserves completed upstream values and marks downstream as unexecuted on failure", () => {
    const records = simulateTrial(graph(), edges, sample, "ai").records;
    expect(records.transfer.status).toBe("succeeded");
    expect(records.transfer.outputs?.tos_path).toBeDefined();
    expect(records.ai.status).toBe("failed");
    expect(records.ai.outputs).toBeUndefined();
    expect(records.end.status).toBe("unexecuted");
  });
  it("excludes only terminal and read-only nodes from result navigation", () => {
    const nodes = graph();
    expect(trialResultNodes([...nodes, { ...nodes[2], id: "read-only", readOnly: true }]).map((node) => node.id)).toEqual(["transfer", "ai"]);
    expect(nodes.map((node) => node.id)).toEqual(["start", "transfer", "ai", "end"]);
  });
  it("numbers visible processing nodes by execution order, excluding terminals", () => {
    const nodes = [...graph()].reverse();
    const run = simulateTrial(nodes, edges, sample);
    const numbered = trialResultNodes(nodes, run.order).map((node, index) => ({ id: node.id, number: index + 1 }));
    expect(numbered).toEqual([{ id: "transfer", number: 1 }, { id: "ai", number: 2 }]);
  });
  it("marks cycles as unexecuted instead of reporting success", () => {
    const records = simulateTrial(graph().slice(1, 3), [{ source: "transfer", target: "ai" }, { source: "ai", target: "transfer" }], sample).records;
    expect(Object.values(records).every((record) => record.status === "unexecuted" && !record.outputs)).toBe(true);
  });
  it("rejects incompatible resources and unavailable configuration references", () => {
    const image = createTrialSample({ ...sample, id: "image", type: "image/jpeg" });
    expect(simulateTrial(graph(), edges, image).records.transfer.error).toContain("需要视频资源");
    const nodes = graph(); nodes[2].config.提示词 = "{transfer.outputs.missing}";
    expect(simulateTrial(nodes, edges, sample).records.ai.status).toBe("failed");
    expect(simulateTrial(nodes, edges, sample).records.ai.outputs).toBeUndefined();
  });
  it("keeps a declared output wrapper even when a column has the same name", () => {
    const nodes = graph(); nodes[2].outputRoot = "gemini_output";
    nodes[2].outputShape![0].key = "gemini_output";
    expect(trialValueAt(simulateTrial(nodes, edges, sample).records.ai.outputs, "gemini_output.gemini_output")).toContain(sample.name);
  });
});
