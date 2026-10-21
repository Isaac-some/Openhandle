import { createNode, getOperator, type FlowDefinition, type WorkflowNodeData } from "@/app/lib/workflow";
import type { Edge, Node } from "@xyflow/react";

export type DraftOrigin = { flowId: string; version: string; name: string; draftId: string };
export function buildFlowDraft(flow: FlowDefinition, draftId: string): { nodes: Node<WorkflowNodeData, "phase2">[]; edges: Edge<Record<string, never>, "phase2">[]; origin: DraftOrigin } {
  const ids = new Map(flow.nodes.map((step, index) => [step.key, `${draftId}:step:${index}`]));
  if (ids.size !== flow.nodes.length || !flow.nodes.length) throw new Error("Flow 步骤为空或身份重复，无法创建草稿。");
  if (flow.edges.some((edge) => !ids.has(edge.source) || !ids.has(edge.target))) throw new Error("Flow 包含失效连线，无法创建草稿。");
  const nodes: Node<WorkflowNodeData, "phase2">[] = flow.nodes.map((step, index) => {
    const operator = getOperator(step.operatorId);
    if (!operator) throw new Error(`步骤 ${step.key} 的算子不可用，无法创建草稿。`);
    const node = createNode(operator, ids.get(step.key)!, { x: 285 + index * 240, y: 170 });
    return { ...node, type: "phase2" as const, data: { ...node.data, config: { ...node.data.config, ...step.config }, mappings: {} } };
  });
  const edges: Edge<Record<string, never>, "phase2">[] = flow.edges.map((edge, index) => {
    if (edge.sourceField && edge.targetField) {
      const target = nodes.find((node) => node.id === ids.get(edge.target))!;
      target.data.mappings[edge.targetField] = { sourceType: "upstream", sourceNodeId: ids.get(edge.source), sourceField: edge.sourceField };
    }
    return { id: `${draftId}:edge:${index}`, source: ids.get(edge.source)!, target: ids.get(edge.target)!, type: "phase2" };
  });
  if (!nodes.some((node) => node.data.operatorId === "control.start")) {
    const start = createNode(getOperator("control.start")!, `${draftId}:start`, { x: 45, y: 170 });
    start.data.config["工作流输入字段"] = "[]";
    const roots = nodes.filter((node) => !edges.some((edge) => edge.target === node.id));
    if (!roots.length) throw new Error("Flow 没有可连接的起点，请检查循环。");
    edges.push(...roots.map((node, index) => ({ id: `${draftId}:start-edge:${index}`, source: start.id, target: node.id, type: "phase2" as const })));
    nodes.unshift({ ...start, type: "phase2" });
  }
  const sinks = nodes.filter((node) => node.data.kind !== "result" && !edges.some((edge) => edge.source === node.id));
  if (sinks.length) {
    const end = createNode(getOperator("control.result")!, `${draftId}:end`, { x: 285 + flow.nodes.length * 240, y: 170 });
    nodes.push({ ...end, type: "phase2" });
    edges.push(...sinks.map((node, index) => ({ id: `${draftId}:end-edge:${index}`, source: node.id, target: end.id, type: "phase2" as const })));
  }
  return { nodes, edges, origin: { flowId: flow.id, version: flow.version, name: flow.name, draftId } };
}
