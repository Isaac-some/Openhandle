import { describe, expect, it } from "vitest";
import { canCopyCanvasNode, expandFieldReferences, expandCsvReferences, referenceParts, createNodeReference, encodeNodeReference, mergeNodeReferences, parseNodeReference, readNodeReferencePaste, resolveNodeReference, type NodeReferenceContext } from "./node-reference";

const context: NodeReferenceContext = {
  projectId: "project-a", workflowId: "flow-a", revision: 2,
  nodes: [{ id: "node-a", label: "视频理解", icon: "bot" }, { id: "node-b", label: "视频理解", icon: "video" }, { id: "node-no-icon", label: "自定义算子" }],
};

describe("node references copied into diagnosis", () => {
  it("round-trips identity, scope and original icon through JSON and text clipboard forms", () => {
    const reference = createNodeReference(context, "node-a")!;
    expect(parseNodeReference(encodeNodeReference(reference))).toEqual(reference);
    expect(parseNodeReference(JSON.stringify(reference))).toEqual(reference);
    expect(readNodeReferencePaste(JSON.stringify(reference), "", context)).toEqual(reference);
    expect(readNodeReferencePaste("", encodeNodeReference(reference), context)).toEqual(reference);
  });

  it("keeps same-named operator instances distinct and resolves names from the snapshot", () => {
    const a = createNodeReference(context, "node-a")!; const b = createNodeReference(context, "node-b")!;
    expect(a.label).toBe(b.label); expect(a.nodeId).not.toBe(b.nodeId);
    expect(mergeNodeReferences([a], [a, b])).toEqual([a, b]);
    const renamed = { ...context, nodes: context.nodes.map((node) => node.id === a.nodeId ? { ...node, label: "改名后的节点" } : node) };
    expect(resolveNodeReference(a, renamed).node?.label).toBe("改名后的节点");
    expect(resolveNodeReference(a, { ...context, nodes: [context.nodes[1]] }).valid).toBe(false);
  });

  it("preserves a usable reference without an icon and drops unsupported icon payloads", () => {
    const reference = createNodeReference(context, "node-no-icon")!;
    expect(reference.icon).toBeUndefined();
    expect(resolveNodeReference(parseNodeReference(encodeNodeReference(reference))!, context).valid).toBe(true);
    expect(parseNodeReference(JSON.stringify({ ...reference, icon: "<svg onload=alert(1)>" }))?.icon).toBeUndefined();
  });

  it("rejects another workflow, project, snapshot or a removed live node", () => {
    const reference = createNodeReference(context, "node-a")!;
    expect(resolveNodeReference({ ...reference, projectId: "project-b" }, context).valid).toBe(false);
    expect(resolveNodeReference({ ...reference, workflowId: "flow-b" }, context).valid).toBe(false);
    expect(resolveNodeReference({ ...reference, revision: 3 }, context).reason).toContain("快照 3");
    expect(resolveNodeReference(reference, context, ["node-b"]).reason).toContain("已从当前草稿删除");
  });

  it("accepts a bare ID only when it uniquely resolves in the selected context, never by name", () => {
    expect(readNodeReferencePaste("", "node-b", context)?.nodeId).toBe("node-b");
    expect(readNodeReferencePaste("", "视频理解", context)).toBeNull();
    expect(readNodeReferencePaste("", "普通文字", context)).toBeNull();
    expect(readNodeReferencePaste("", "node-b", { ...context, nodes: [context.nodes[1], context.nodes[1]] })).toBeNull();
  });

  it("leaves malformed data, external links and invalid revisions as ordinary paste text", () => {
    for (const text of ["{", "null", "https://example.com/", "workflow-node://bad?nodeId=node-a", JSON.stringify({ ...createNodeReference(context, "node-a"), revision: -1 }), JSON.stringify({ ...createNodeReference(context, "node-a"), version: 99 })]) {
      expect(parseNodeReference(text)).toBeNull();
    }
  });

  it("copies only a single canvas node, preserving text and multi-selection behavior", () => {
    const base = { canvasFocused: true, editingText: false, selectedText: false, selectionCount: 1 };
    expect(canCopyCanvasNode(base)).toBe(true);
    expect(canCopyCanvasNode({ ...base, editingText: true })).toBe(false);
    expect(canCopyCanvasNode({ ...base, selectedText: true })).toBe(false);
    expect(canCopyCanvasNode({ ...base, canvasFocused: false })).toBe(false);
    expect(canCopyCanvasNode({ ...base, selectionCount: 0 })).toBe(false);
    expect(canCopyCanvasNode({ ...base, selectionCount: 2 })).toBe(false);
  });
});

describe("complete input/output and CSV field tokens", () => {
  const fields = { ...context, nodes: [{ id: "transfer", label: "视频转存", fields: { inputs: ["vid"], outputs: ["vid", "result.full.path"] } }, { id: "start", label: "CSV 输入", fields: { csv: ["path", "文件 路径"] } }] };
  it("distinguishes the vid input from a same-named output without matching by name", () => {
    const input = readNodeReferencePaste("", "{transfer.inputs.vid}", fields)!;
    const output = readNodeReferencePaste("", "{transfer.outputs.vid}", fields)!;
    expect(input.field).toEqual({ direction: "inputs", path: "vid" });
    expect(output.field?.direction).toBe("outputs");
    expect(mergeNodeReferences([input], [output])).toHaveLength(2);
    expect(readNodeReferencePaste("", "{transfer.outputs.result.full.path}", fields)?.field?.path).toBe("result.full.path");
    expect(readNodeReferencePaste("", "vid", fields)).toBeNull();
  });
  it("retains missing field identities and blocks resolution instead of replacing same-named fields", () => {
    const input = readNodeReferencePaste("", "{transfer.inputs.vid}", fields)!;
    expect(parseNodeReference(encodeNodeReference(input))).toEqual(input);
    const removed = { ...fields, nodes: fields.nodes.map((node) => node.id === "transfer" ? { ...node, fields: { outputs: ["vid"] } } : node) };
    expect(resolveNodeReference(input, removed).valid).toBe(false);
  });
  it("copies a full CSV header including whitespace, and resolves it in the explicit input context", () => {
    expect(readNodeReferencePaste("", "{csv.文件 路径}", fields)?.field).toEqual({ direction: "csv", path: "文件 路径" });
    expect(readNodeReferencePaste("", "{csv.missing}", fields)).toBeNull();
    expect(readNodeReferencePaste("", "{csv.path}", { ...fields, nodes: [...fields.nodes, { id: "other-input", label: "第二 CSV", fields: { csv: ["path"] } }] })).toBeNull();
  });
});


it("evaluates each CSV row independently while retaining the saved expression and normal JSON text", () => {
  const template = "处理 {csv.path}，编号 {csv.vid}";
  expect(expandCsvReferences(template, { path: "a.mp4", vid: "1" })).toBe("处理 a.mp4，编号 1");
  expect(expandCsvReferences(template, { path: "b.mp4", vid: "2" })).toBe("处理 b.mp4，编号 2");
  expect(template).toContain("{csv.path}");
  expect(expandCsvReferences("{csv.missing}", { path: "a.mp4" })).toBe("{csv.missing}");
  expect(referenceParts('格式 {"title":"示例"}')).toEqual(['格式 {"title":"示例"}']);
});


it("resolves copied input fields in mixed configuration text for each data item", () => {
  const fields = { ...context, nodes: [{ id: "transfer", label: "视频转存", fields: { inputs: ["vid"] } }] };
  const template = "处理 {transfer.inputs.vid}，保留普通文字";
  expect(expandFieldReferences(template, fields, () => "row-a")).toBe("处理 row-a，保留普通文字");
  expect(expandFieldReferences(template, fields, () => "row-b")).toBe("处理 row-b，保留普通文字");
  expect(template).toContain("{transfer.inputs.vid}");
  expect(() => expandFieldReferences(template, fields, () => undefined)).toThrow("尚无");
  expect(() => expandFieldReferences("{transfer.inputs.removed}", fields, () => "wrong")).toThrow("失效");
  expect(expandFieldReferences('格式 {"title":"示例"}', fields, () => "wrong")).toBe('格式 {"title":"示例"}');
  expect(expandFieldReferences(template, fields, () => "{transfer.inputs.vid}")).toBe(template);
});
