import { fieldsCompatible, type FieldMapping, type OperatorField, type WorkflowConfigValue } from "../../app/lib/workflow";
import type { NodeReferenceIcon } from "./node-reference";
import type { DiagnosisContext } from "./prototype-diagnosis";
import { outputShapeErrors, type OutputShapeField } from "./output-schema";

export type DiagnosisNodeSnapshot = {
  id: string; label: string; operatorId?: string; icon?: NodeReferenceIcon; readOnly?: boolean;
  config?: Record<string, WorkflowConfigValue>; mappings?: Record<string, FieldMapping>;
  inputs?: OperatorField[]; fields?: { inputs?: string[]; outputs?: string[]; csv?: string[] };
  sources?: { nodeId: string; nodeLabel: string; field: OperatorField; direct: boolean }[];
};
export type ConfigurationChange = {
  nodeId: string; nodeLabel: string; section: "config" | "mappings"; key: string;
  before: WorkflowConfigValue | FieldMapping | undefined;
  after: WorkflowConfigValue | FieldMapping | undefined;
  beforeLabel: string; afterLabel: string; reason: string;
};
export type ConfigurationPlan = { id: string; recordId: string; baseRevision: number; changes: ConfigurationChange[] };
export type RepairOutcome = { ok: boolean; message: string; revision?: number };

type EditableNode = { id: string; data: { label: string; readOnly?: boolean; config: Record<string, WorkflowConfigValue>; mappings: Record<string, FieldMapping> } };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function createConfigurationPlan(context: DiagnosisContext): ConfigurationPlan {
  const changes: ConfigurationChange[] = [];
  for (const issue of context.issues) {
    const node = context.nodes.find((item) => item.id === issue.nodeId);
    if (!node || node.readOnly || !issue.field) continue;
    if (changes.some((item) => item.nodeId === node.id && item.key === issue.field)) continue;
    const input = node.inputs?.find((field) => field.key === issue.field);
    const binding = node.mappings?.[issue.field];
    if (input && binding?.sourceType === "upstream") {
      const compatible = node.sources?.filter((source) => source.field.key === input.key && source.field.type === input.type && source.field.cardinality === input.cardinality && fieldsCompatible(source.field, input)) ?? [];
      const direct = compatible.filter((source) => source.direct);
      const candidates = direct.length ? direct : compatible;
      if (candidates.length !== 1) continue;
      const source = candidates[0];
      const after: FieldMapping = { sourceType: "upstream", sourceNodeId: source.nodeId, sourceField: source.field.key };
      if (same(after, binding)) continue;
      changes.push({ nodeId: node.id, nodeLabel: node.label, section: "mappings", key: input.key, before: binding, after,
        beforeLabel: `${context.nodes.find((item) => item.id === binding.sourceNodeId)?.label ?? binding.sourceNodeId} → ${binding.sourceField}`,
        afterLabel: `${source.nodeLabel} → ${source.field.key}`,
        reason: "原绑定字段已失效；现有可达上游中，存在唯一同名且类型兼容的直接来源。仅修改入参绑定，不改变流程连线。" });
    }
    if (issue.field === "AI输出结构" && typeof node.config?.["AI输出结构"] === "string") {
      try {
        const before = node.config["AI输出结构"];
        const shape: OutputShapeField[] = JSON.parse(before);
        if (!Array.isArray(shape) || !shape.length) continue;
        const seen = new Set<string>();
        const next = shape.map((field, index) => {
          const base = /^[A-Za-z_][A-Za-z0-9_]*$/.test(field.key) ? field.key : `field_${index + 1}`;
          let key = base; let suffix = 2;
          while (seen.has(key)) key = `${base}_${suffix++}`;
          seen.add(key); return { ...field, key };
        });
        if (outputShapeErrors(next).length || same(shape, next)) continue;
        changes.push({ nodeId: node.id, nodeLabel: node.label, section: "config", key: "AI输出结构", before, after: JSON.stringify(next),
          beforeLabel: shape.map((field) => field.key || "空列名").join("、"), afterLabel: next.map((field) => field.key).join("、"),
          reason: "修正为空、重复或不合法的列名。改名可能影响下游引用，应用后重新校验；请确认列名符合业务含义。" });
      } catch { /* Unrecognised configuration requires evidence/manual review, not a guessed repair. */ }
    }
  }
  return { id: `${context.id}-configuration`, recordId: context.id, baseRevision: context.revision, changes };
}

export function applyConfigurationPlan<T extends EditableNode>(nodes: T[], plan: ConfigurationPlan, revision: number): T[] {
  if (plan.baseRevision !== revision) throw new Error("草稿已变化，请对当前配置重新校验并发起诊断");
  if (!plan.changes.length) throw new Error("当前没有可应用的配置方案");
  // Validate the complete proposal before changing any node: a partial repair must not be committed.
  for (const change of plan.changes) {
    const node = nodes.find((item) => item.id === change.nodeId);
    if (!node || node.data.readOnly) throw new Error("方案涉及的节点已删除或只读，请重新诊断");
    if (change.section !== "config" && change.section !== "mappings") throw new Error("仅允许修改节点配置或字段映射");
    if (!same(node.data[change.section][change.key], change.before)) throw new Error("方案对应配置已改变，请重新诊断");
  }
  return nodes.map((node) => {
    const changes = plan.changes.filter((item) => item.nodeId === node.id);
    if (!changes.length) return node;
    const config = { ...node.data.config }; const mappings = { ...node.data.mappings };
    for (const change of changes) {
      if (change.section === "config") {
        if (change.after === undefined) delete config[change.key];
        else config[change.key] = structuredClone(change.after) as WorkflowConfigValue;
      } else {
        if (change.after === undefined) delete mappings[change.key];
        else mappings[change.key] = structuredClone(change.after) as FieldMapping;
      }
    }
    return { ...node, data: { ...node.data, config, mappings } };
  });
}

export function reverseConfigurationPlan(plan: ConfigurationPlan, revision: number): ConfigurationPlan {
  return { ...plan, baseRevision: revision, changes: plan.changes.map((change) => ({ ...change, before: change.after, after: change.before, beforeLabel: change.afterLabel, afterLabel: change.beforeLabel })) };
}
