"use client";

import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileCheck2,
  Focus,
  HelpCircle,
  Hand,
  LoaderCircle,
  MoreHorizontal,
  MousePointer2,
  Redo2,
  RotateCcw,
  Save,
  Rocket,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OperatorLibrary } from "./operator-library";
import { ConnectionInspector } from "./connection-inspector";
import { InspectorPanel } from "./inspector-panel";
import { WorkflowEdge } from "./workflow-edge";
import { WorkflowNode } from "./workflow-node";
import { FlowGroupNode } from "./flow-group-node";
import { ValidationRunPanel, type ValidationRunState } from "./validation-run-panel";
import {
  createInitialWorkflow,
  createNode,
  fieldsCompatible,
  getAggregateCompatibility,
  getConnectionStatusForFields,
  getConditionRules,
  getEdgeFieldPair,
  getNodeOutputFields,
  getOperator,
  getOperatorRoutes,
  getRecommendedOperatorIds,
  instantiateFlow,
  publishedFlows,
  shiftNodesForConditionGrowth,
  type BuilderEdge,
  type BuilderNode,
  type ConditionRule,
  type FlowDefinition,
  type OperatorDefinition,
  type OperatorField,
  type WorkflowConfigValue,
  type ValidationIssue,
  validateWorkflow,
  wouldCreateCycle,
} from "@/app/lib/workflow";

const STORAGE_KEY = "agent-workflow-builder:draft:v8";
const LEGACY_STORAGE_KEY = "agent-workflow-builder:draft:v7";
const PRIVATE_WORKFLOWS_KEY = "agent-workflow-builder:private-workflows:v1";
const nodeTypes = { workflow: WorkflowNode, flowGroup: FlowGroupNode };
const edgeTypes = { workflow: WorkflowEdge };

interface Snapshot { nodes: BuilderNode[]; edges: BuilderEdge[] }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function migrateSnapshot(snapshot: Snapshot): Snapshot {
  const nodes = snapshot.nodes.map((node) => {
    if (node.data.operatorId === "control.condition") {
      return { ...node, data: { ...node.data, config: { ...node.data.config, "分流规则": getConditionRules(node.data.config) } } };
    }
    if (node.data.operatorId === "control.result") {
      const previousName = typeof node.data.config["结果名称"] === "string" ? node.data.config["结果名称"] : undefined;
      const config: Record<string, WorkflowConfigValue> = { ...node.data.config, "结局类型": node.data.config["结局类型"] || "输出结果", "结局名称": node.data.config["结局名称"] || previousName || "pipeline_result" };
      delete config["结果名称"];
      return { ...node, data: { ...node.data, label: "结束", config, mappings: {} } };
    }
    return node;
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = snapshot.edges.map((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const route = source ? getOperatorRoutes(source.data.operatorId, source.data.config).find((item) => item.id === (edge.sourceHandle || edge.data?.routeId)) : undefined;
    if (target?.data.operatorId === "control.result") return { ...edge, data: { routeId: route?.id, routeLabel: route?.label } };
    return route ? { ...edge, data: { ...edge.data, routeId: route.id, routeLabel: route.label } } : edge;
  });
  return { nodes, edges };
}

function draftFingerprint(workflowName: string, nodes: BuilderNode[], edges: BuilderEdge[]) {
  return JSON.stringify({
    workflowName,
    nodes: nodes.map((node) => ({ id: node.id, position: node.position, data: { operatorId: node.data.operatorId, label: node.data.label, kind: node.data.kind, mappings: node.data.mappings, config: node.data.config } })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, data: edge.data })),
  });
}

function buildEdgeData(sourceFields: OperatorField[], targetOperator: OperatorDefinition | undefined, sourceField?: string, targetField?: string) {
  const status = getConnectionStatusForFields(sourceFields, targetOperator, sourceField, targetField);
  return {
    fields: sourceField && targetField ? [`${sourceField} → ${targetField}`] : [],
    sourceField,
    targetField,
    mismatch: !status.compatible,
    mismatchReason: status.compatible ? undefined : status.reason,
  };
}

function WorkflowBuilderInner() {
  const [initial] = useState(() => createInitialWorkflow());
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<BuilderNode>(initial.nodes);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<BuilderEdge>(initial.edges.map((edge) => ({ ...edge, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 } })));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [validationOpen, setValidationOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [workflowName, setWorkflowName] = useState("多媒体质量校验");
  const [successOpen, setSuccessOpen] = useState(false);
  const [createdWorkflowId, setCreatedWorkflowId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const [validationRun, setValidationRun] = useState<ValidationRunState | null>(null);
  const [validatedFingerprint, setValidatedFingerprint] = useState<string | null>(null);
  const [canvasMode, setCanvasMode] = useState<"pan" | "select">("pan");
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const validationTimers = useRef<number[]>([]);
  const placementCursor = useRef(0);
  const { screenToFlowPosition, fitView } = useReactFlow<BuilderNode, BuilderEdge>();
  const currentFingerprint = useMemo(() => draftFingerprint(workflowName, nodes, edges), [workflowName, nodes, edges]);

  const clearValidationTimers = useCallback(() => {
    validationTimers.current.forEach((timer) => window.clearTimeout(timer));
    validationTimers.current = [];
  }, []);

  useEffect(() => () => clearValidationTimers(), [clearValidationTimers]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Snapshot & { workflowName?: string };
          if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
            const migrated = migrateSnapshot(parsed);
            const migrationIssues = validateWorkflow(migrated.nodes, migrated.edges);
            const needsGraphMigration = migrationIssues.some((issue) => issue.id === "missing-start" || issue.id.startsWith("implicit-merge-"));
            if (needsGraphMigration) {
              toast.info("旧草稿缺少新版流程结构，已保留原数据并打开符合新规则的示例。");
            } else {
              setNodes(migrated.nodes);
              setEdges(migrated.edges.map((edge) => ({ ...edge, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 } })));
              if (parsed.workflowName) setWorkflowName(parsed.workflowName);
              setSelectedNodeId(null);
            }
          }
        }
      } catch {
        toast.warning("本地草稿无法读取，已恢复示例编排。");
      } finally {
        setHydrated(true);
      }
    });
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const snapshotNodes = nodes.map((node) => ({ ...node, data: { ...node.data, runState: "idle", runDetail: undefined } }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ workflowName, nodes: snapshotNodes, edges, savedAt: new Date().toISOString() }));
      setSaveState("saved");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, workflowName, hydrated]);

  const issues = useMemo(() => validateWorkflow(nodes, edges), [nodes, edges]);
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const warningCount = issues.filter((issue) => issue.level === "warning").length;
  const issueCounts = useMemo(() => {
    const counts = new Map<string, number>();
    issues.forEach((issue) => { if (issue.nodeId) counts.set(issue.nodeId, (counts.get(issue.nodeId) || 0) + (issue.level === "error" ? 1 : 0)); });
    return counts;
  }, [issues]);
  const invalidEdges = useMemo(() => new Set(issues.map((issue) => issue.edgeId).filter(Boolean)), [issues]);

  const capture = useCallback(() => {
    history.current.push({ nodes: clone(nodes), edges: clone(edges) });
    if (history.current.length > 40) history.current.shift();
    future.current = [];
    setHistoryCounts({ undo: history.current.length, redo: 0 });
    setSaveState("dirty");
  }, [nodes, edges]);

  const undo = () => {
    const snapshot = history.current.pop();
    if (!snapshot) return;
    future.current.push({ nodes: clone(nodes), edges: clone(edges) });
    setNodes(snapshot.nodes); setEdges(snapshot.edges); setHistoryCounts({ undo: history.current.length, redo: future.current.length });
  };

  const redo = () => {
    const snapshot = future.current.pop();
    if (!snapshot) return;
    history.current.push({ nodes: clone(nodes), edges: clone(edges) });
    setNodes(snapshot.nodes); setEdges(snapshot.edges); setHistoryCounts({ undo: history.current.length, redo: future.current.length });
  };

  const onNodesChange = useCallback((changes: NodeChange<BuilderNode>[]) => {
    if (changes.some((change) => change.type !== "select" && change.type !== "dimensions")) setSaveState("dirty");
    onNodesChangeBase(changes);
  }, [onNodesChangeBase]);

  const onEdgesChange = useCallback((changes: EdgeChange<BuilderEdge>[]) => {
    if (changes.some((change) => change.type !== "select")) setSaveState("dirty");
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase]);

  const updateNodeData = useCallback((nodeId: string, updater: (data: BuilderNode["data"]) => BuilderNode["data"]) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: updater(node.data) } : node));
  }, [setNodes]);

  const updateConditionRules = useCallback((nodeId: string, rules: ConditionRule[]) => {
    capture();
    const conditionNode = nodes.find((node) => node.id === nodeId);
    const previousRuleCount = conditionNode ? getConditionRules(conditionNode.data.config).length : rules.length;
    const heightDelta = (rules.length - previousRuleCount) * 32;
    const routes = new Map([...rules.map((rule) => [rule.id, rule.label] as const), ["else", "Else"] as const]);
    setNodes((current) => shiftNodesForConditionGrowth(current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, config: { ...node.data.config, "分流规则": rules } } } : node), nodeId, heightDelta));
    setEdges((current) => current
      .filter((edge) => edge.source !== nodeId || routes.has(String(edge.sourceHandle || edge.data?.routeId || "")))
      .map((edge) => {
        if (edge.source !== nodeId) return edge;
        const routeId = String(edge.sourceHandle || edge.data?.routeId || "");
        return { ...edge, data: { ...edge.data, routeId, routeLabel: routes.get(routeId) } };
      }));
    setSelectedEdgeId(null);
    setSaveState("dirty");
  }, [capture, nodes, setEdges, setNodes]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return;
    const sourceOperator = getOperator(sourceNode.data.operatorId);
    const targetOperator = getOperator(targetNode.data.operatorId);
    const sourceRoutes = getOperatorRoutes(sourceNode.data.operatorId, sourceNode.data.config);
    const sourceRoute = sourceRoutes.find((route) => route.id === connection.sourceHandle);
    if (sourceRoutes.length > 0 && !sourceRoute) {
      toast.error("请从带名称的分支出口发起连接。");
      return;
    }
    if (sourceRoute && edges.some((edge) => edge.source === sourceNode.id && (edge.sourceHandle === sourceRoute.id || edge.data?.routeId === sourceRoute.id))) {
      toast.error(`出口「${sourceRoute.label}」已经连接；每个具名出口只能有一条路径。`);
      return;
    }
    if (targetOperator?.id === "control.start") {
      toast.error("不能连接：启动节点不能有前序节点。");
      return;
    }
    if (wouldCreateCycle(nodes, edges, sourceNode.id, targetNode.id)) {
      toast.error("不能连接：这条线会回到前序节点并形成循环。");
      return;
    }
    const samePairEdges = edges.filter((edge) => edge.source === sourceNode.id && edge.target === targetNode.id);
    const repeatsSameRoute = samePairEdges.some((edge) => (edge.sourceHandle || edge.data?.routeId || "default") === (connection.sourceHandle || sourceRoute?.id || "default"));
    if (repeatsSameRoute || (samePairEdges.length > 0 && !["control.aggregate", "control.result"].includes(targetOperator?.id || ""))) {
      toast.warning("这两个节点已经连接。");
      return;
    }
    const sourceFields = getNodeOutputFields(sourceNode.id, nodes, edges);
    if (!["control.aggregate", "control.result"].includes(targetOperator?.id || "") && edges.some((edge) => edge.target === targetNode.id && edge.source !== sourceNode.id)) {
      toast.error("不能直接汇合：两条线路必须先经过聚合节点。");
      return;
    }
    if (targetOperator?.id === "control.result") {
      capture();
      const edgeId = `edge-${connection.source}-${connection.sourceHandle || "default"}-${connection.target}-${Date.now()}`;
      setEdges((current) => addEdge({
        ...connection,
        id: edgeId,
        type: "workflow",
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
        data: { routeId: sourceRoute?.id, routeLabel: sourceRoute?.label },
      }, current));
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      toast.success("已连接到结束节点，该路径的数据将记录明确结局。");
      return;
    }
    if (targetOperator?.id === "control.aggregate") {
      const incoming = edges.filter((edge) => edge.target === targetNode.id);
      const status = getAggregateCompatibility([...incoming.map((edge) => edge.source), sourceNode.id], nodes, edges);
      if (!status.compatible) {
        toast.error(`不能聚合：${status.reason}`);
        return;
      }
      capture();
      const edgeId = `edge-${connection.source}-${connection.target}-${Date.now()}`;
      setEdges((current) => addEdge({
        ...connection,
        id: edgeId,
        type: "workflow",
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
        data: { routeId: sourceRoute?.id, routeLabel: sourceRoute?.label },
      }, current));
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      toast.success(incoming.length === 0 ? "已接入第一条线路，等待第二条字段完全一致的线路。" : status.reason);
      return;
    }
    if (sourceOperator?.id === "control.start") {
      capture();
      const edgeId = `edge-${connection.source}-${connection.target}-${Date.now()}`;
      setEdges((current) => addEdge({ ...connection, id: edgeId, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 }, data: {} }, current));
      setSelectedEdgeId(edgeId);
      setSelectedNodeId(null);
      toast.success("已设置工作流的第一步。");
      return;
    }
    capture();
    const unmapped = targetOperator?.inputs.find((input) => !targetNode?.data.mappings[input.key]) || targetOperator?.inputs[0];
    const matched = unmapped
      ? sourceFields.find((output) => fieldsCompatible(output, unmapped)) || sourceFields[0]
      : sourceFields[0];
    const edgeId = `edge-${connection.source}-${connection.target}-${Date.now()}`;
    const edgeData = {
      ...buildEdgeData(sourceFields, targetOperator, matched?.key, unmapped?.key),
      routeId: sourceRoute?.id,
      routeLabel: sourceRoute?.label,
    };
    setEdges((current) => addEdge({ ...connection, id: edgeId, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 }, data: edgeData }, current));
    if (targetNode && unmapped && matched) updateNodeData(targetNode.id, (data) => ({ ...data, mappings: { ...data.mappings, [unmapped.key]: { sourceType: "upstream", sourceNodeId: sourceNode?.id, sourceField: matched.key } } }));
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    if (edgeData.mismatch) toast.warning("字段不匹配：已保留连线，请在右侧选择正确的出参与入参。");
  }, [capture, edges, nodes, setEdges, updateNodeData]);

  const setConnectionFields = useCallback((edgeId: string, sourceField: string, targetField: string) => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    if (!sourceNode || !targetNode) return;
    capture();
    const previousPair = getEdgeFieldPair(edge);
    const data = buildEdgeData(getNodeOutputFields(sourceNode.id, nodes, edges), getOperator(targetNode.data.operatorId), sourceField, targetField);
    setEdges((current) => current.map((item) => item.id === edgeId ? { ...item, data: { ...item.data, ...data } } : item));
    setNodes((current) => current.map((node) => {
      if (node.id !== targetNode.id) return node;
      const mappings = { ...node.data.mappings };
      if (previousPair.targetField && previousPair.targetField !== targetField && mappings[previousPair.targetField]?.sourceNodeId === sourceNode.id) delete mappings[previousPair.targetField];
      mappings[targetField] = { sourceType: "upstream", sourceNodeId: sourceNode.id, sourceField };
      return { ...node, data: { ...node.data, mappings } };
    }));
    toast[data.mismatch ? "warning" : "success"](data.mismatch ? "字段仍不匹配，可添加字段映射关系。" : "连接字段已匹配。");
  }, [capture, edges, nodes, setEdges, setNodes]);

  const nextPosition = useCallback((currentNodes = nodes) => {
    const base = screenToFlowPosition({ x: window.innerWidth * 0.58, y: window.innerHeight * 0.46 });
    const offsets = Array.from({ length: 50 }, (_, index) => ({
      x: ((index % 5) - 2) * 270,
      y: (Math.floor(index / 5) - 2) * 190,
    }));
    const cursor = placementCursor.current;
    const orderedOffsets = offsets.map((_, index) => {
      const offsetIndex = (cursor + index) % offsets.length;
      return { offsetIndex, offset: offsets[offsetIndex] };
    });
    const available = orderedOffsets.find(({ offset }) => {
      const candidate = { x: base.x + offset.x, y: base.y + offset.y };
      return currentNodes.every((node) => Math.abs(node.position.x - candidate.x) >= 235 || Math.abs(node.position.y - candidate.y) >= 155);
    });
    if (available) {
      placementCursor.current = (available.offsetIndex + 1) % offsets.length;
      return { x: base.x + available.offset.x, y: base.y + available.offset.y };
    }
    const lowestY = currentNodes.reduce((maximum, node) => Math.max(maximum, node.position.y), base.y);
    placementCursor.current = (cursor + 1) % offsets.length;
    return { x: base.x, y: lowestY + 190 };
  }, [nodes, screenToFlowPosition]);

  const addOperator = useCallback((operator: OperatorDefinition, position?: { x: number; y: number }) => {
    if (operator.id === "control.start" && nodes.some((node) => node.data.operatorId === "control.start")) {
      toast.warning("工作流中已经有启动节点。");
      return;
    }
    capture();
    const id = `node-${operator.id.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
    const created = createNode(operator, id, position || nextPosition());
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { ...created, selected: true }]);
    setSelectedNodeId(id);
    toast.success(`已添加 ${operator.name}`);
  }, [capture, nextPosition, nodes, setNodes]);

  const quickAddOperator = useCallback((sourceNodeId: string, operatorId: string) => {
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const operator = getOperator(operatorId);
    if (!sourceNode || !operator || edges.some((edge) => edge.source === sourceNodeId)) return;
    capture();
    const basePosition = { x: sourceNode.position.x + 280, y: sourceNode.position.y };
    const position = Array.from({ length: 8 }, (_, index) => ({ x: basePosition.x, y: basePosition.y + index * 170 }))
      .find((candidate) => nodes.every((node) => node.data.kind === "flow" || Math.abs(node.position.x - candidate.x) >= 235 || Math.abs(node.position.y - candidate.y) >= 145))
      || basePosition;
    const id = `node-${operator.id.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}`;
    const created = createNode(operator, id, position);
    const sourceFields = getNodeOutputFields(sourceNode.id, nodes, edges);
    const targetInput = operator.inputs.find((input) => input.required && !input.system && sourceFields.some((output) => fieldsCompatible(output, input)))
      || operator.inputs.find((input) => !input.system);
    const sourceField = targetInput ? sourceFields.find((output) => fieldsCompatible(output, targetInput)) || sourceFields[0] : undefined;
    if (targetInput && sourceField) {
      created.data.mappings[targetInput.key] = { sourceType: "upstream", sourceNodeId, sourceField: sourceField.key };
    }
    const edgeId = `edge-${sourceNodeId}-${id}-${Date.now()}`;
    const edgeData = sourceNode.data.operatorId === "control.start" || ["control.aggregate", "control.result"].includes(operator.id)
      ? {}
      : buildEdgeData(sourceFields, operator, sourceField?.key, targetInput?.key);
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), { ...created, selected: true }]);
    setEdges((current) => [...current, { id: edgeId, source: sourceNodeId, target: id, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 }, data: edgeData }]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    toast.success(`已在 ${sourceNode.data.label} 后添加 ${operator.name}`);
  }, [capture, edges, nodes, setEdges, setNodes]);

  const unlockFlow = useCallback((flowNodeId: string) => {
    const frame = nodes.find((node) => node.id === flowNodeId && node.data.kind === "flow");
    if (!frame) return;
    capture();
    setNodes((current) => current
      .filter((node) => node.id !== flowNodeId)
      .map((node) => node.parentId === flowNodeId
        ? {
          ...node,
          parentId: undefined,
          extent: undefined,
          draggable: true,
          position: { x: frame.position.x + node.position.x, y: frame.position.y + node.position.y },
          data: { ...node.data, flowLocked: false },
        }
        : node));
    toast.success(`已解锁 Flow「${frame.data.label}」，内部节点现在可以独立编排`);
  }, [capture, nodes, setNodes]);

  const deleteSelection = useCallback(() => {
    const nodeIds = new Set(nodes.filter((node) => node.selected || node.id === selectedNodeId).map((node) => node.id));
    const edgeIds = new Set(edges.filter((edge) => edge.id === selectedEdgeId || edge.selected).map((edge) => edge.id));
    if (!nodeIds.size && !edgeIds.size) return;
    capture();
    const remainingEdges = edges.filter((edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target));
    const remainingNodes = nodes
      .filter((node) => !nodeIds.has(node.id))
      .map((node) => ({
        ...node,
        selected: false,
        data: {
          ...node.data,
          mappings: Object.fromEntries(Object.entries(node.data.mappings).filter(([, mapping]) => {
            if (mapping.sourceType !== "upstream") return true;
            return remainingEdges.some((edge) => edge.source === mapping.sourceNodeId && edge.target === node.id);
          })),
        },
      }));
    setNodes(remainingNodes);
    setEdges(remainingEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    toast.success(nodeIds.size > 0 ? `已删除 ${nodeIds.size} 个节点及关联连线` : `已删除 ${edgeIds.size} 条连线`);
  }, [capture, edges, nodes, selectedEdgeId, selectedNodeId, setEdges, setNodes]);

  const duplicateSelection = useCallback(() => {
    const selected = nodes.filter((node) => node.selected || node.id === selectedNodeId);
    if (!selected.length) return;
    capture();
    const idMap = new Map(selected.map((node) => [node.id, `${node.id}-copy-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`]));
    const copies = selected.map((node) => {
      const copied = clone(node);
      copied.id = idMap.get(node.id)!;
      copied.position = { x: node.position.x + 42, y: node.position.y + 42 };
      copied.selected = true;
      copied.data.mappings = Object.fromEntries(Object.entries(copied.data.mappings).filter(([, mapping]) => mapping.sourceType !== "upstream" || idMap.has(mapping.sourceNodeId || "")).map(([key, mapping]) => [key, mapping.sourceType === "upstream" ? { ...mapping, sourceNodeId: idMap.get(mapping.sourceNodeId || "") } : mapping]));
      return copied;
    });
    const copiedEdges = edges.filter((edge) => idMap.has(edge.source) && idMap.has(edge.target)).map((edge) => ({ ...clone(edge), id: `${edge.id}-copy-${Date.now()}`, source: idMap.get(edge.source)!, target: idMap.get(edge.target)!, selected: false }));
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...copies]);
    setEdges((current) => [...current, ...copiedEdges]);
    setSelectedNodeId(copies[0]?.id || null);
  }, [capture, edges, nodes, selectedNodeId, setEdges, setNodes]);

  const addFlow = useCallback((flow: FlowDefinition, position?: { x: number; y: number }) => {
    capture();
    const instance = instantiateFlow(flow, `flow-${Date.now()}`, position || nextPosition());
    const flowEdges = instance.edges.map((edge) => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 } }));
    setNodes((current) => [...current.map((node) => ({ ...node, selected: false })), ...instance.nodes.map((node) => ({ ...node, selected: false }))]);
    setEdges((current) => [...current, ...flowEdges]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    window.setTimeout(() => fitView({ nodes: instance.nodes, duration: 300, padding: 0.4 }), 50);
    toast.success(`已添加并锁定 Flow「${flow.name}」：${flow.nodes.length} 个节点`);
  }, [capture, fitView, nextPosition, setEdges, setNodes]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const operatorId = event.dataTransfer.getData("application/workflow-operator");
    const operator = getOperator(operatorId);
    const flowId = event.dataTransfer.getData("application/workflow-flow");
    if (operator) {
      addOperator(operator, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      return;
    }
    const flow = publishedFlows.find((item) => item.id === flowId);
    if (flow) addFlow(flow, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addFlow, addOperator, screenToFlowPosition]);

  const focusIssue = (issue: ValidationIssue) => {
    if (!issue.nodeId) return;
    setSelectedNodeId(issue.nodeId);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === issue.nodeId })));
    const target = nodes.find((node) => node.id === issue.nodeId);
    if (target) fitView({ nodes: [target], duration: 250, padding: 1.4, maxZoom: 1.15 });
  };

  const setNodeRun = useCallback((operatorId: string, runState: BuilderNode["data"]["runState"], runDetail: string) => {
    setNodes((current) => current.map((node) => node.data.operatorId === operatorId ? { ...node, data: { ...node.data, runState, runDetail } } : node));
  }, [setNodes]);

  const startValidationRun = useCallback(() => {
    clearValidationTimers();
    setValidationOpen(false);
    setValidatedFingerprint(null);
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, runState: "queued", runDetail: "等待校验" } })));
    setValidationRun({ phase: "running", step: 0, startedAt: new Date().toISOString() });
    setNodeRun("control.start", "succeeded", "已进入流程");
    setNodeRun("tos.list", "running", "读取 6 条素材");

    const schedule = (delay: number, action: () => void) => validationTimers.current.push(window.setTimeout(action, delay));
    schedule(450, () => { setNodeRun("tos.list", "succeeded", "6 条素材"); setNodeRun("vod.video.get", "running", "解析媒体信息"); setValidationRun((run) => run ? { ...run, step: 1 } : run); });
    schedule(900, () => { setNodeRun("vod.video.get", "succeeded", "3 个视频"); setNodeRun("vod.frame.extract", "running", "抽取 18 帧"); setValidationRun((run) => run ? { ...run, step: 2 } : run); });
    schedule(1350, () => { setNodeRun("vod.frame.extract", "succeeded", "18 帧"); setNodeRun("ai-platform.deepseek", "running", "机器质量判断"); setValidationRun((run) => run ? { ...run, step: 3 } : run); });
    schedule(1900, () => { setNodeRun("ai-platform.deepseek", "succeeded", "4 通过 / 2 复核"); setNodeRun("control.wait", "pending", "等待 2 条回传"); setValidationRun((run) => run ? { ...run, phase: "pending", step: 4 } : run); });
  }, [clearValidationTimers, setNodeRun, setNodes]);

  const runValidation = () => {
    if (errorCount > 0) {
      setValidationRun(null);
      setValidationOpen(true);
      toast.error(`发现 ${errorCount} 个阻断问题`);
      focusIssue(issues.find((issue) => issue.level === "error")!);
      return;
    }
    toast.success(warningCount ? `静态检查通过，有 ${warningCount} 个风险提醒，开始素材校验` : "静态检查通过，开始测试素材校验");
    startValidationRun();
  };

  const submitHumanReview = () => {
    clearValidationTimers();
    setNodeRun("control.wait", "succeeded", "2 条人工通过");
    setNodeRun("control.result", "running", "核对 6 条数据的最终结局");
    setValidationRun((run) => run ? { ...run, phase: "running", step: 5 } : run);
    validationTimers.current.push(window.setTimeout(() => {
      setNodeRun("control.result", "succeeded", "6 / 6 已到达结束");
      setValidationRun((run) => run ? { ...run, phase: "complete", step: 5 } : run);
      setValidatedFingerprint(currentFingerprint);
      toast.success("校验闭环已完成：6 条资源全部形成结果");
    }, 700));
  };

  const generateWorkflow = () => {
    if (errorCount > 0) { runValidation(); return; }
    if (validatedFingerprint !== currentFingerprint) { toast.warning("当前草稿尚未完成素材校验，已先为你开始校验。"); startValidationRun(); return; }
    const id = `private-wf-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { id, name: workflowName, visibility: "owner_only", registration: "project_private", status: "online", validatedAt: new Date().toISOString(), createdAt: new Date().toISOString(), snapshot: { nodes, edges } };
    const existing = JSON.parse(window.localStorage.getItem(PRIVATE_WORKFLOWS_KEY) || "[]") as unknown[];
    window.localStorage.setItem(PRIVATE_WORKFLOWS_KEY, JSON.stringify([record, ...existing].slice(0, 20)));
    setCreatedWorkflowId(id); setSuccessOpen(true);
  };

  const resetDemo = () => {
    capture();
    const restored = createInitialWorkflow();
    setNodes(restored.nodes); setEdges(restored.edges.map((edge) => ({ ...edge, type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 } })));
    setSelectedNodeId(null); setSelectedEdgeId(null); setWorkflowName("多媒体质量校验"); setValidationRun(null); setValidatedFingerprint(null); clearValidationTimers();
    toast.success("已恢复示例编排");
  };

  const displayNodes = useMemo(() => nodes.map((node) => {
    const isTerminal = node.data.kind === "result";
    const hasDownstream = edges.some((edge) => edge.source === node.id);
    const canQuickAdd = node.data.kind !== "flow" && !isTerminal && !node.data.flowLocked && !hasDownstream;
    return {
      ...node,
      data: {
        ...node.data,
        validationCount: issueCounts.get(node.id) || 0,
        connectedRouteIds: edges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle || edge.data?.routeId).filter(Boolean) as string[],
        incomingCount: edges.filter((edge) => edge.target === node.id).length,
        quickAddOperatorIds: canQuickAdd ? getRecommendedOperatorIds(node.id, nodes, edges) : [],
        onQuickAdd: quickAddOperator,
        onUnlockFlow: unlockFlow,
      },
    };
  }), [edges, issueCounts, nodes, quickAddOperator, unlockFlow]);
  const displayEdges = useMemo(() => edges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    const pair = getEdgeFieldPair(edge);
    const status = getConnectionStatusForFields(source ? getNodeOutputFields(source.id, nodes, edges) : [], target ? getOperator(target.data.operatorId) : undefined, pair.sourceField, pair.targetField);
    const hasFieldPair = Boolean(pair.sourceField && pair.targetField);
    const mismatch = hasFieldPair && !status.compatible && edge.data?.relationOperatorId !== "control.transform";
    return { ...edge, selected: edge.id === selectedEdgeId, data: { ...edge.data, invalid: invalidEdges.has(edge.id), mismatch, mismatchReason: mismatch ? status.reason : undefined } };
  }), [edges, invalidEdges, nodes, selectedEdgeId]);
  const selectedNode = displayNodes.find((node) => node.id === selectedNodeId && node.data.kind !== "flow");
  const selectedEdge = displayEdges.find((edge) => edge.id === selectedEdgeId);
  const selectedEdgeSource = selectedEdge ? displayNodes.find((node) => node.id === selectedEdge.source) : undefined;
  const selectedEdgeTarget = selectedEdge ? displayNodes.find((node) => node.id === selectedEdge.target) : undefined;
  const selectedEdgeSourceFields = selectedEdgeSource ? getNodeOutputFields(selectedEdgeSource.id, nodes, edges) : [];

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelection(); }
      if ((event.key === "Backspace" || event.key === "Delete") && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); deleteSelection(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <TooltipProvider delayDuration={350}>
      <div className="fixed inset-0 min-w-[1180px] overflow-hidden bg-white text-[var(--foreground)]">
        <a href="#workflow-canvas" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:ring-2 focus:ring-[var(--ring)]">跳到编排画布</a>
        <header className="flex h-[58px] items-center justify-between border-b border-[var(--border)] bg-white px-3" aria-label="编排工具栏">
          <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label="返回"><ArrowLeft className="h-4 w-4" /></Button><div className="h-5 w-px bg-[var(--border)]" /><div className="min-w-0"><div className="flex items-center gap-2"><input value={workflowName} onChange={(event) => { setWorkflowName(event.target.value); setSaveState("dirty"); }} className="w-[280px] truncate rounded-md bg-transparent px-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--ring)]" aria-label="工作流名称" /><Badge className="border-[var(--operator-border)] bg-[var(--operator-soft)] text-[var(--operator-strong)]">Draft</Badge></div><p className="px-1 text-[10px] text-[var(--muted-foreground)]">项目 / 图片生产线 · {nodes.filter((node) => node.data.kind !== "flow").length} 节点 · {edges.length} 连线</p></div></div>
          <div className="flex items-center gap-2"><div className="mr-1 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]" role="status" aria-live="polite">{saveState === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : saveState === "saved" ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <Save className="h-3.5 w-3.5" />}{saveState === "saving" ? "正在保存" : saveState === "saved" ? "已自动保存" : "有未保存更改"}</div>{validatedFingerprint === currentFingerprint && <Badge className="border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]">已校验</Badge>}<Button variant="outline" onClick={runValidation}><FileCheck2 className="h-4 w-4" />校验{errorCount > 0 && <span className="rounded-full bg-[var(--danger-soft)] px-1.5 text-[10px] text-[var(--danger)]">{errorCount}</span>}</Button><Button onClick={generateWorkflow}><Rocket className="h-4 w-4" />上线</Button><Button variant="ghost" size="icon-sm" aria-label="更多操作"><MoreHorizontal className="h-4 w-4" /></Button></div>
        </header>

        <main className="grid h-[calc(100%_-_86px)] min-h-0 grid-cols-[310px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <OperatorLibrary onAddOperator={addOperator} onAddFlow={addFlow} />
          <section id="workflow-canvas" className="relative h-full min-h-0 min-w-0 overflow-hidden bg-[var(--canvas)]" aria-label="Pipeline 编排画布">
            <ReactFlow<BuilderNode, BuilderEdge>
              className={canvasMode === "select" ? "workflow-canvas--select" : "workflow-canvas--pan"}
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onNodeClick={(_, node) => { if (node.data.kind === "flow") return; setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
              onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
              onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
              onNodeDragStart={capture}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.8}
              deleteKeyCode={null}
              multiSelectionKeyCode="Shift"
              selectionKeyCode={canvasMode === "select" ? null : "Shift"}
              selectionOnDrag={canvasMode === "select"}
              selectionMode={SelectionMode.Partial}
              panOnDrag={canvasMode === "pan"}
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "workflow", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 } }}
              aria-label="工作流画布，使用 Shift 框选多个节点"
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="oklch(0.83 0.01 255)" />
              <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} nodeColor={(node) => node.data?.kind === "flow" ? "transparent" : node.data?.kind === "result" || node.data?.operatorId === "control.start" ? "var(--terminal-border)" : node.data?.kind === "control" ? "var(--control-border)" : "var(--operator-border)"} maskColor="oklch(0.9846 0.0017 247.84 / 0.74)" className="!mb-3 !mr-3 !h-[92px] !w-[150px] !rounded-[10px] !border !border-[var(--border)] !bg-white" ariaLabel="工作流小地图" />
              <Controls position="bottom-left" showInteractive={false} className="!bottom-3 !left-3 !overflow-hidden !rounded-[10px] !border !border-[var(--border)] !bg-white !shadow-none"><ControlButton onClick={() => fitView({ duration: 250, padding: 0.18 })} title="适应画布" aria-label="适应画布"><Focus className="h-3.5 w-3.5" /></ControlButton></Controls>
              <Panel position="top-center" className="!m-3 flex items-center gap-1 rounded-[10px] border border-[var(--border)] bg-white p-1 shadow-sm">
                <ToolButton label="撤销" onClick={undo} disabled={historyCounts.undo === 0} icon={<Undo2 />} />
                <ToolButton label="重做" onClick={redo} disabled={historyCounts.redo === 0} icon={<Redo2 />} />
                <span className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolButton label="拖动画布" onClick={() => setCanvasMode("pan")} active={canvasMode === "pan"} icon={<Hand />} />
                <ToolButton label="框选节点" onClick={() => setCanvasMode("select")} active={canvasMode === "select"} icon={<MousePointer2 />} />
                <span className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolButton label="复制选中节点" onClick={duplicateSelection} disabled={!selectedNodeId && !nodes.some((node) => node.selected)} icon={<Copy />} />
                <ToolButton label="删除选中节点或连线" onClick={deleteSelection} disabled={!selectedNodeId && !selectedEdgeId && !nodes.some((node) => node.selected)} icon={<Trash2 />} />
                <span className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolButton label="恢复示例编排" onClick={resetDemo} icon={<RotateCcw />} />
              </Panel>
              {validationOpen && <Panel position="bottom-center" className="!bottom-3 !m-0 w-[min(760px,calc(100%-220px))]"><ValidationPanel issues={issues} onClose={() => setValidationOpen(false)} onFocus={focusIssue} /></Panel>}
              {validationRun && <Panel position="bottom-center" className="!bottom-3 !m-0 w-[min(1040px,calc(100%-70px))]"><ValidationRunPanel run={validationRun} onReview={submitHumanReview} onRestart={startValidationRun} onClose={() => { clearValidationTimers(); setValidationRun(null); }} /></Panel>}
            </ReactFlow>
            {(selectedEdge && selectedEdgeSource && selectedEdgeTarget) || selectedNode ? (
              <div className="absolute inset-y-0 right-0 z-30 w-[360px] shadow-[-6px_0_8px_oklch(0.235_0.025_255/0.08)]">
                {selectedEdge && selectedEdgeSource && selectedEdgeTarget
                  ? <ConnectionInspector edge={selectedEdge} source={selectedEdgeSource} sourceFields={selectedEdgeSourceFields} target={selectedEdgeTarget} onClose={() => setSelectedEdgeId(null)} onDelete={deleteSelection} onSetFields={setConnectionFields} />
                  : <InspectorPanel node={selectedNode} nodes={displayNodes} edges={displayEdges} onUpdate={updateNodeData} onConditionRulesChange={updateConditionRules} onDelete={deleteSelection} onDuplicate={duplicateSelection} />}
              </div>
            ) : null}
          </section>
        </main>

        <footer className="flex h-7 items-center justify-between border-t border-[var(--border)] bg-[var(--surface)] px-3 text-[10px] text-[var(--muted-foreground)]"><div className="flex items-center gap-4"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />54 个启用算子</span><span>{publishedFlows.length} 个 Flow 节点组 · 聚合字段严格一致</span><span>算子快照校验日期 2026-06-30</span></div><div className="flex items-center gap-3"><span>{canvasMode === "pan" ? "左键拖动画布" : "左键框选节点"}</span><span>复制 ⌘D</span><span>删除 Delete</span><HelpCircle className="h-3.5 w-3.5" /></div></footer>

        <div className="pointer-events-none fixed inset-0 z-[80] hidden items-center justify-center bg-white px-8 text-center max-[1179px]:flex"><div><AlertCircle className="mx-auto h-8 w-8 text-[var(--warning)]" /><h2 className="mt-4 text-lg font-semibold">请使用桌面端编排</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">该画布需要至少 1180px 宽度来同时展示算子库、编排路径和字段配置。</p></div></div>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent>
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]"><CheckCircle2 className="h-5 w-5" /></div>
          <DialogTitle className="mt-4">工作流已上线</DialogTitle>
          <DialogDescription>当前编排和依赖版本已冻结为项目私有快照。只有当前用户可见可用，后续修改不会影响这次上线版本。</DialogDescription>
          <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3"><div className="flex items-center justify-between"><span className="text-[11px] text-[var(--muted-foreground)]">工作流 ID</span><div className="flex gap-1.5"><Badge className="border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]">已上线</Badge><Badge className="border-[oklch(0.80_0.08_255)] bg-[oklch(0.97_0.018_255)] text-[oklch(0.42_0.10_255)]">仅自己可见</Badge></div></div><p className="mt-2 break-all font-mono text-xs font-semibold">{createdWorkflowId}</p></div>
          <div className="mt-5 flex justify-end"><Button onClick={() => setSuccessOpen(false)}>知道了</Button></div>
        </DialogContent>
      </Dialog>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}

function ToolButton({ label, onClick, disabled, active, icon }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; icon: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} className={active ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]" : undefined}>{cloneElement(icon, { className: "h-3.5 w-3.5" } as React.HTMLAttributes<HTMLElement>)}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function ValidationPanel({ issues, onClose, onFocus }: { issues: ValidationIssue[]; onClose: () => void; onFocus: (issue: ValidationIssue) => void }) {
  const errors = issues.filter((issue) => issue.level === "error");
  const warnings = issues.filter((issue) => issue.level === "warning");
  return <section className="max-h-[230px] overflow-hidden rounded-[12px] border border-[var(--border-strong)] bg-white shadow-[0_8px_24px_oklch(0.2_0.02_255/0.12)]" aria-label="校验结果"><div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3"><div><h2 className="text-sm font-semibold">校验结果</h2><p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">只检查方案，不运行真实资源，不创建 Batch。</p></div><div className="flex items-center gap-2">{errors.length > 0 ? <Badge className="border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]">{errors.length} 阻断</Badge> : <Badge className="border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]">通过</Badge>}{warnings.length > 0 && <Badge className="border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-strong)]">{warnings.length} 警告</Badge>}<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="收起校验结果"><ChevronDown className="h-4 w-4" /></Button></div></div><div className="max-h-[160px] overflow-y-auto p-2">{issues.length === 0 ? <div className="flex items-center gap-3 rounded-lg bg-[oklch(0.97_0.025_155)] px-3 py-3 text-xs text-[oklch(0.40_0.12_155)]"><CheckCircle2 className="h-4 w-4" />节点、连线、必填字段和正式无循环规则均已通过。</div> : <div className="space-y-1">{issues.map((issue) => <button key={issue.id} onClick={() => onFocus(issue)} className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{issue.level === "error" ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />}<span><span className="block text-xs font-medium">{issue.title}</span><span className="mt-0.5 block text-[10px] leading-4 text-[var(--muted-foreground)]">{issue.detail}</span></span></button>)}</div>}</div></section>;
}

export function WorkflowBuilder() {
  return <ReactFlowProvider><WorkflowBuilderInner /></ReactFlowProvider>;
}
