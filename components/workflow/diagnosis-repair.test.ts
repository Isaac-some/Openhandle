import { describe, expect, it } from "vitest";
import type { FieldMapping, OperatorField, WorkflowConfigValue } from "../../app/lib/workflow";
import type { DiagnosisContext } from "./prototype-diagnosis";
import { applyConfigurationPlan, createConfigurationPlan, reverseConfigurationPlan } from "./diagnosis-repair";

const field: OperatorField = { key: "vid", type: "String", semanticType: "VideoId", cardinality: "one", required: true };
function example() {
  const invalid: FieldMapping = { sourceType: "upstream", sourceNodeId: "start", sourceField: "missing" };
  const context: DiagnosisContext = {
    id: "validation-1", source: "validation", revision: 1, recordedAt: "15:00:00", phase: "blocked", inputCount: 0,
    nodes: [{ id: "start", label: "开始" }, { id: "transfer", label: "转存", config: { timeout: 600 }, mappings: { vid: invalid }, inputs: [field], sources: [{ nodeId: "start", nodeLabel: "开始", direct: true, field }] }],
    issues: [{ nodeId: "transfer", field: "vid", message: "来源失效" }],
  };
  const nodes = [{ id: "transfer", position: { x: 235, y: 180 }, data: { label: "转存", operatorId: "vod.upload.tos", readOnly: false, config: { timeout: 600 } as Record<string, WorkflowConfigValue>, mappings: { vid: invalid } as Record<string, FieldMapping> } }];
  return { context, nodes };
}

describe("configuration-only diagnosis repair", () => {
  it("proposes a reachable compatible binding and applies without changing identity, position or other configuration", () => {
    const { context, nodes } = example(); const plan = createConfigurationPlan(context);
    expect(plan.changes).toHaveLength(1);
    const next = applyConfigurationPlan(nodes, plan, 1);
    expect(next[0].data.mappings.vid.sourceField).toBe("vid");
    expect(nodes[0].data.mappings.vid.sourceField).toBe("missing");
    expect(next[0].id).toBe(nodes[0].id); expect(next[0].position).toEqual(nodes[0].position);
    expect(next[0].data.operatorId).toBe("vod.upload.tos"); expect(next[0].data.config).toEqual(nodes[0].data.config);
    expect(applyConfigurationPlan(next, reverseConfigurationPlan(plan, 2), 2)).toEqual(nodes);
  });

  it("does not guess when sources are ambiguous or incompatible", () => {
    const { context } = example();
    context.nodes[1].sources!.push({ nodeId: "other", nodeLabel: "另一上游", direct: true, field });
    expect(createConfigurationPlan(context).changes).toHaveLength(0);
    context.nodes[1].sources = [{ nodeId: "start", nodeLabel: "开始", direct: true, field: { ...field, type: "Int" } }];
    expect(createConfigurationPlan(context).changes).toHaveLength(0);
  });

  it("blocks stale, read-only, removed or changed targets before any mutation", () => {
    const { context, nodes } = example(); const plan = createConfigurationPlan(context);
    expect(() => applyConfigurationPlan(nodes, plan, 2)).toThrow("草稿已变化");
    expect(() => applyConfigurationPlan([], plan, 1)).toThrow("节点已删除或只读");
    expect(() => applyConfigurationPlan([{ ...nodes[0], data: { ...nodes[0].data, readOnly: true } }], plan, 1)).toThrow("节点已删除或只读");
    expect(() => applyConfigurationPlan([{ ...nodes[0], data: { ...nodes[0].data, mappings: {} } }], plan, 1)).toThrow("配置已改变");
    const multi = { ...plan, changes: [...plan.changes, { ...plan.changes[0], nodeId: "removed" }] };
    expect(() => applyConfigurationPlan(nodes, multi, 1)).toThrow();
    expect(nodes[0].data.mappings.vid.sourceField).toBe("missing");
  });

  it("only repairs expressible output-column naming and keeps the before/after preview", () => {
    const { context } = example();
    context.nodes[1].config = { AI输出结构: JSON.stringify([{ key: "title", type: "String", required: true, description: "标题" }, { key: "title", type: "String", required: true, description: "另一个字段" }]) };
    context.issues = [{ nodeId: "transfer", field: "AI输出结构", message: "重复列名" }];
    const plan = createConfigurationPlan(context);
    expect(plan.changes[0].beforeLabel).toBe("title、title");
    expect(plan.changes[0].afterLabel).toBe("title、title_2");
    context.nodes[1].readOnly = true;
    expect(createConfigurationPlan(context).changes).toHaveLength(0);
  });
});
