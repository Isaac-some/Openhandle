"use client";

// Throwaway interaction prototype. One focused direction follows the user's
// minimal-change brief. ?prototype=phase2 keeps the existing prototype intact.
// No company source, production API, persistence, or real execution is used.
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import {
  Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, Handle,
  MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, getBezierPath,
  useEdgesState, useNodesState, useReactFlow, type Connection, type Edge,
  type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import {
  AlertCircle, ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronRight,
  ChevronUp, Copy, Database, FileCheck2, Focus, GitBranch, Hand,
  History, Info, LoaderCircle, Maximize2, MessageSquarePlus, MousePointer2, Play, Plus,
  Redo2, Save, Settings2, ShieldCheck, Trash2, Undo2, User,
  Workflow, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createNode, fieldsCompatible, fieldsExactlyMatch, getOperator, getOperatorRoutes, getConditionRules,
  type FieldMapping, type OperatorField,
  type WorkflowNodeData, type WorkflowConfigValue,
} from "@/app/lib/workflow";
import { FloatingDock } from "@/components/ui/floating-dock";
import { SourcePicker } from "./source-picker";
import { buildOutputSchema, columnTypes, importOutputSchema, outputShapeErrors, outputColumnPath, type OutputShapeField } from "./output-schema";
import { DiagnosisPanel } from "./diagnosis-panel";
import type { DiagnosisContext } from "./prototype-diagnosis";
import { applyConfigurationPlan, reverseConfigurationPlan, type ConfigurationPlan, type DiagnosisNodeSnapshot, type RepairOutcome } from "./diagnosis-repair";
import { NODE_REFERENCE_MIME, canCopyCanvasNode, createNodeReference, createFieldReference, referenceToken, readNodeReferencePaste, resolveNodeReference, expandFieldReferences, referencePattern, mergeNodeReferences, nodeReferenceKey, prototypeReferenceScope, type NodeReference, type NodeReferenceIcon } from "./node-reference";
import { nextNodePosition } from "./node-placement";
import { deriveWorkflowInputs } from "./workflow-inputs";
import { simulateTrial, retainTrial, trialResultNodes, type TrialSample, type NodeTrialRecord } from "./trial-run";
import { activeTrials, deleteTrial, trialCapacity, updateTrialMetadata, TRIAL_LIMIT, type TrialRetention } from "./trial-history";
import { loadTrialHistory, saveTrialHistory } from "./trial-history-store";
import { TrialDock, TrialRunDetails, TrialRunHistory, TrialSamplePreparation, TrialSamplePreview } from "./trial-run-panel";
import { ReferenceTextEditor } from "./reference-text-editor";
import { NodeReferenceGlyph } from "./node-reference-icon";
import { CapabilityDiscovery } from "./capability-discovery";
import { candidates, flowSource, understandingIds } from "./capability-catalog";
import { canUseCapability, selectCapabilityVersion, type Capability as Candidate, type SearchMode } from "./capability-search";
import { buildFlowDraft, type DraftOrigin } from "./flow-draft";
import { CAPABILITY_DRAG_MIME, resolveCapabilityDrop } from "./capability-drag";
import "./phase2-prototype.css";

type PhaseData = WorkflowNodeData & {
  purpose?: "understanding" | "generation";
  source?: "engineering" | "custom";
  expanded?: boolean;
  readOnly?: boolean;
  issue?: string;
  sourcePreview?: boolean;
  onAdd?: (id: string) => void;
  onReference?: (id: string) => void;
  onExpand?: (id: string) => void;
};
type PhaseNode = Node<PhaseData, "phase2" | "phase2group">;
type PhaseEdge = Edge<{ onInsert?: (id: string) => void; mappingFields?: { key: string; label: string }[]; onMap?: (field: string) => void }, "phase2">;
type Issue = { nodeId: string; field?: string; message: string };
type Run = TrialRetention & {
  id: string; sequence?: number; failures: Issue[]; sample: TrialSample; records: Record<string, NodeTrialRecord>;
  phase: "running" | "passed" | "failed";
  revision: number; count: number; startedAt: string;
  nodes: PhaseNode[]; edges: PhaseEdge[]; inputs: string[]; unexecutedIds?: string[]; failureNode?: string; failureReason?: string;
};
type Dock = "none" | "validation" | "setup" | "run" | "history";
type Snapshot = { nodes: PhaseNode[]; edges: PhaseEdge[] };
let prototypeNodeSequence = 10;
function allocateNodeId() { return `p2-${++prototypeNodeSequence}`; }

const modelNames: Record<string, string> = {
  "ai-platform.gemini": "Gemini", "ai-platform.deepseek": "DeepSeek",
  "ai-platform.qwen_tmp1": "Qwen", "ai-platform.seedream.img2img": "Seedream",
};
const runtimeDefaults = { 超时时间: 600, 阶段并发: 128 };
const defaultOutputShape: OutputShapeField[] = [
  { key: "title", type: "String", required: true, description: "视频标题" },
  { key: "keywords", type: "String", required: true, description: "内容关键词，多个关键词用逗号分隔" },
  { key: "summary", type: "String", required: true, description: "主要内容摘要" },
];
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }
function makeNode(operatorId: string, id: string, x: number, y: number, extra: Partial<PhaseData> = {}): PhaseNode {
  const op = getOperator(operatorId);
  const base: Pick<PhaseNode, "id" | "position" | "data"> = op ? createNode(op, id, { x, y }) : { id, position: { x, y }, data: { operatorId, label: operatorId === "phase2.ratio" ? "比例分流" : "合流", kind: "control" as const, config: operatorId === "phase2.ratio" ? { 分支数: 2, "分支1比例": 70, "分支2比例": 30 } : {}, mappings: {}, validationCount: 0 } };
  return { ...base, type: "phase2", data: { ...base.data, ...extra } };
}
function makeEdge(source: string, target: string, extra: Partial<PhaseEdge> = {}): PhaseEdge {
  return { id: `${source}-${target}-${Math.random().toString(36).slice(2, 6)}`, source, target, type: "phase2", markerEnd: { type: MarkerType.ArrowClosed, color: "#a4abb5", width: 16, height: 16 }, ...extra };
}
function initialGraph(): Snapshot {
  const start = makeNode("control.start", "start", 60, 180, { label: "开始" });
  const transfer = makeNode("vod.upload.tos", "transfer", 235, 180, { label: "视频转存" });
  start.data.config["工作流输入字段"] = "[]";
  const ai = makeNode("ai-platform.gemini", "ai", 410, 180, { label: "AI 理解与标注", purpose: "understanding" });
  ai.data.mappings = { tos_path: { sourceType: "upstream", sourceNodeId: "transfer", sourceField: "tos_path" } };
  ai.data.config["提示词"] = "描述视频的主要内容，供内容运营人员快速了解视频主题。";
  ai.data.config["AI输出结构"] = JSON.stringify(defaultOutputShape);
  const end = makeNode("control.result", "end", 585, 180, { label: "结束" });
  return { nodes: [start, transfer, ai, end], edges: [makeEdge("start", "transfer"), makeEdge("transfer", "ai"), makeEdge("ai", "end")] };
}
function getFlow(data: PhaseData) { return flowSource.find((f) => f.id === data.flowId && (!data.flowVersion || f.version === data.flowVersion)); }
function inputFields(data: PhaseData): OperatorField[] {
  const flow = getFlow(data);
  return getOperator(flow?.nodes[0]?.operatorId ?? data.operatorId)?.inputs ?? [];
}
function outputShape(data: PhaseData): OutputShapeField[] {
  if (!data.purpose || data.purpose !== "understanding") return [];
  try {
    const parsed = JSON.parse(String(data.config["AI输出结构"] ?? ""));
    if (Array.isArray(parsed)) return parsed.filter((field) => typeof field?.key === "string").map((field) => ({ key: field.key, type: String(field.type ?? "String"), required: Boolean(field.required), description: String(field.description ?? ""), ...(Array.isArray(field.choices) ? { choices: field.choices.map(String) } : {}) }));
  } catch { /* Keep the sample structure visible if an old draft has no structure yet. */ }
  return clone(defaultOutputShape);
}
function outputFields(data: PhaseData): OperatorField[] {
  if (data.operatorId === "control.start") {
    try { return JSON.parse(String(data.config["工作流输入字段"] ?? "[]")) as OperatorField[]; }
    catch { return []; }
  }
  const flow = getFlow(data);
  const declared = getOperator(flow?.nodes.at(-1)?.operatorId ?? data.operatorId)?.outputs ?? [];
  if (data.purpose !== "understanding") return declared;
  const base = declared[0];
  return [...declared, ...outputShape(data).filter((field) => field.key.trim()).map((field) => ({ key: outputColumnPath(field.key, base?.key), type: field.type, semanticType: `field.json.${field.key}`, cardinality: field.type === "List" ? "many" : "one" }))];
}
function availableOutputFields(id: string, nodes: PhaseNode[], edges: PhaseEdge[], seen = new Set<string>()): OperatorField[] {
  if (seen.has(id)) return [];
  const node = nodes.find((item) => item.id === id);
  if (!node) return [];
  const nextSeen = new Set(seen).add(id);
  if (node.data.operatorId !== "phase2.merge") return outputFields(node.data);
  const incoming = edges.find((edge) => edge.target === id);
  return incoming ? availableOutputFields(incoming.source, nodes, edges, nextSeen) : [];
}
function findExactUpstreamFields(input: OperatorField, upstream: PhaseNode[], nodes: PhaseNode[], edges: PhaseEdge[]) {
  return upstream.flatMap((source) => availableOutputFields(source.id, nodes, edges).map((field) => ({ source, field }))).filter(({ field }) => fieldsExactlyMatch(field, input));
}
function upstreamOf(id: string, nodes: PhaseNode[], edges: PhaseEdge[]) {
  const seen = new Set<string>();
  const walk = (target: string) => edges.filter((e) => e.target === target).forEach((e) => { if (!seen.has(e.source)) { seen.add(e.source); walk(e.source); } });
  walk(id); return nodes.filter((n) => seen.has(n.id) && !n.data.readOnly);
}
function referenceFields(data: PhaseData) {
  return { inputs: inputFields(data).map((field) => field.key), outputs: outputFields(data).map((field) => field.key) };
}
function referenceContext(nodes: PhaseNode[], revision: number) {
  return { ...prototypeReferenceScope, revision, nodes: nodes.map((node) => ({ id: node.id, label: node.data.label, icon: nodeGlyphIcon(node.data), fields: referenceFields(node.data) })) };
}
function getIssues(nodes: PhaseNode[], edges: PhaseEdge[]): Issue[] {
  const issues: Issue[] = [];
  const active = nodes.filter((n) => !n.data.readOnly);
  if (active.filter((n) => n.data.operatorId === "control.start").length !== 1) issues.push({ nodeId: active[0]?.id ?? "", message: "需要且只能有一个开始节点" });
  const reachable = new Set<string>();
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); edges.filter((e) => e.source === id).forEach((e) => visit(e.target)); };
  active.filter((n) => n.data.operatorId === "control.start").forEach((n) => visit(n.id));
  const reachesEnd = (id: string, seen = new Set<string>()): boolean => {
    const n = active.find((x) => x.id === id); if (n?.data.kind === "result") return true;
    if (seen.has(id)) return false; seen.add(id);
    return edges.filter((e) => e.source === id).some((e) => reachesEnd(e.target, new Set(seen)));
  };
  active.forEach((n) => {
    if (n.data.operatorId !== "control.start" && !reachable.has(n.id)) issues.push({ nodeId: n.id, message: "尚未连接到开始节点" });
    if (n.data.kind !== "result" && !reachesEnd(n.id)) issues.push({ nodeId: n.id, message: "线路尚未连接到结束节点" });
    const upstream = upstreamOf(n.id, nodes, edges);
    inputFields(n.data).filter((f) => f.required && !f.system).forEach((f) => {
      const m = n.data.mappings[f.key];
      if (!m) {
        issues.push({ nodeId: n.id, field: f.key, message: `请校验补齐工作流输入，或为 ${f.key} 选择上游输出` });
        return;
      }
      if (m.sourceType === "parameter") { issues.push({ nodeId: n.id, field: f.key, message: `请校验，将 ${f.key} 补齐到工作流输入` }); return; }
      if (m.sourceType === "fixed") { issues.push({ nodeId: n.id, field: f.key, message: `${f.key} 需要映射字段来源，请选择上游输出或工作流输入` }); return; }
      if (m.sourceType === "upstream") {
        const source = upstream.find((s) => s.id === m.sourceNodeId);
        const field = source && availableOutputFields(source.id, nodes, edges).find((x) => x.key === m.sourceField);
        const resolvedField = field;
        if (!resolvedField) issues.push({ nodeId: n.id, field: f.key, message: `${f.key} 的来源已失效，请重新绑定` });
        else if (!fieldsCompatible(resolvedField, f)) issues.push({ nodeId: n.id, field: f.key, message: `${f.key} 与来源的类型或结构不匹配，请显式转换` });
      }
    });
    for (const [key, value] of Object.entries({ ...n.data.config, ...Object.fromEntries(Object.entries(n.data.mappings).filter(([, mapping]) => mapping.sourceType === "fixed").map(([key, mapping]) => [key, mapping.value])) })) {
      if (typeof value !== "string" || key === "AI输出结构") continue;
      for (const token of value.match(referencePattern) ?? []) {
        const ctx = referenceContext(nodes, 1);
        const bindingReference = readNodeReferencePaste("", token, ctx);
        const reachable = bindingReference && (bindingReference.field?.direction === "csv" || upstream.some((source) => source.id === bindingReference.nodeId) || (bindingReference.nodeId === n.id && bindingReference.field?.direction === "inputs"));
        if (!bindingReference || !resolveNodeReference(bindingReference, ctx).valid || !reachable || !bindingReference.field) issues.push({ nodeId: n.id, field: key, message: `${key} 中 ${token} 的字段不存在或执行时不可取，请重新绑定` });
      }
    }
    const requiredKeys = new Set(inputFields(n.data).filter((field) => field.required && !field.system).map((field) => field.key));
    Object.entries(n.data.mappings).filter(([key, binding]) => !requiredKeys.has(key) && binding.sourceType === "upstream").forEach(([key, binding]) => {
      const source = upstream.find((item) => item.id === binding.sourceNodeId);
      const target = inputFields(n.data).find((item) => item.key === key);
      const field = source && availableOutputFields(source.id, nodes, edges).find((item) => item.key === binding.sourceField);
      const resolvedField = field;
      if (!resolvedField) issues.push({ nodeId: n.id, field: key, message: `${key} 的来源已失效，请重新绑定` });
      else if (target && !fieldsCompatible(resolvedField, target)) issues.push({ nodeId: n.id, field: key, message: `${key} 与来源的类型或结构不匹配，请显式转换` });
    });
    getOperator(n.data.operatorId)?.config.filter((f) => f.required).forEach((f) => {
      if (n.data.config[f.key] === "" || n.data.config[f.key] === undefined) issues.push({ nodeId: n.id, field: f.key, message: `请填写 ${f.key}` });
    });
    if (n.data.purpose === "understanding") {
      const shape = outputShape(n.data);
      outputShapeErrors(shape).forEach((message) => issues.push({ nodeId: n.id, field: "AI输出结构", message }));
    }
    if (n.data.operatorId === "control.result") {
      const selectedOutputs = n.data.config["交付字段"];
      if (Array.isArray(selectedOutputs) && !selectedOutputs.length) issues.push({ nodeId: n.id, field: "交付字段", message: "请选择至少一个最终交付字段" });
      if (Array.isArray(selectedOutputs)) selectedOutputs.forEach((entry) => {
        const [sourceId, ...fieldParts] = String(entry).split("|");
        const source = upstream.find((item) => item.id === sourceId);
        if (!source || !availableOutputFields(source.id, nodes, edges).some((field) => field.key === fieldParts.join("|"))) issues.push({ nodeId: n.id, field: "交付字段", message: `交付字段来源已失效：${fieldParts.join("|")}` });
      });
    }
    if (n.data.operatorId === "phase2.ratio") {
      const count = Number(n.data.config["分支数"] ?? 2);
      if (Array.from({ length: count }, (_, i) => Number(n.data.config[`分支${i + 1}比例`] ?? 0)).reduce((a, b) => a + b, 0) !== 100) issues.push({ nodeId: n.id, field: "比例", message: "分支比例合计需为 100%" });
      for (let i = 0; i < count; i++) if (!edges.some((e) => e.source === n.id && e.sourceHandle === `branch-${i}`)) issues.push({ nodeId: n.id, message: `分支 ${i + 1} 尚未连接` });
    }
    if (["control.condition", "control.filter"].includes(n.data.operatorId)) {
      getOperatorRoutes(n.data.operatorId, n.data.config).forEach((r) => { if (!edges.some((e) => e.source === n.id && e.sourceHandle === r.id)) issues.push({ nodeId: n.id, message: `${r.label} 出口尚未连接` }); });
    }
    if (n.data.operatorId === "phase2.merge") {
      const incoming = edges.filter((edge) => edge.target === n.id);
      const left = incoming[0] ? availableOutputFields(incoming[0].source, nodes, edges) : [];
      const right = incoming[1] ? availableOutputFields(incoming[1].source, nodes, edges) : [];
      const sameSchema = left.length === right.length && left.every((field) => right.some((candidate) => fieldsExactlyMatch(field, candidate)));
      if (incoming.length !== 2) issues.push({ nodeId: n.id, message: "合流需要连接两条支线" });
      else if (!sameSchema) issues.push({ nodeId: n.id, message: "两条支线的输入字段不完全一致，请先统一字段结构" });
    }
    if (n.data.flowId) issues.push({ nodeId: n.id, message: "整组已添加；内部完整配置与运行校验需正式执行器确认" });
  });
  return issues;
}
function diagnosisNodes(nodes: PhaseNode[], edges: PhaseEdge[]): DiagnosisNodeSnapshot[] {
  return nodes.map((node) => ({
    id: node.id, label: node.data.label, operatorId: node.data.operatorId, icon: nodeGlyphIcon(node.data), fields: referenceFields(node.data), readOnly: node.data.readOnly,
    config: clone(node.data.config), mappings: clone(node.data.mappings), inputs: clone(inputFields(node.data)),
    sources: upstreamOf(node.id, nodes, edges).flatMap((source) => availableOutputFields(source.id, nodes, edges).map((field) => ({ nodeId: source.id, nodeLabel: source.data.label, field: clone(field), direct: edges.some((edge) => edge.source === source.id && edge.target === node.id) }))),
  }));
}
function nodeGlyphIcon(data: PhaseData): NodeReferenceIcon {
  if (data.flowId) return "workflow";
  if (data.purpose === "generation") return "image";
  if (data.purpose) return "bot";
  if (data.operatorId === "control.start") return "play";
  if (data.kind === "result") return "output";
  if (data.operatorId.includes("ratio")) return "split";
  if (data.kind === "control") return "branch";
  if (getOperator(data.operatorId)?.domains.includes("video")) return "video";
  return "layers";
}
function NodeGlyph({ data }: { data: PhaseData }) { return <NodeReferenceGlyph icon={nodeGlyphIcon(data)} size={30} />; }

function CompactNode({ id, data, selected }: NodeProps<PhaseNode>) {
  const terminal = data.operatorId === "control.start" || data.kind === "result";
  const branches = data.operatorId === "phase2.ratio" ? Array.from({ length: Number(data.config["分支数"] ?? 2) }, (_, i) => ({ id: `branch-${i}`, label: `${data.config[`分支${i + 1}比例`] ?? 0}%` })) : getOperatorRoutes(data.operatorId, data.config);
  return <div className={`p2-node ${selected ? "is-selected" : ""} ${terminal ? "is-terminal" : ""} ${data.flowId ? "is-flow" : ""} ${data.issue ? "is-error" : ""} ${data.sourcePreview ? "is-source-preview" : ""}`}>
    {data.onReference && <button className="p2-node-reference" aria-label={`引用${data.label}到诊断`} title="引用到诊断" onClick={(event) => { event.stopPropagation(); data.onReference?.(id); }}><MessageSquarePlus size={14} /></button>}
    <div className="p2-node-body" style={branches.length > 2 ? { height: Math.max(76, branches.length * 24 + 16) } : undefined} aria-label={`${data.label}${data.issue ? `，${data.issue}` : ""}`}>
      {data.operatorId !== "control.start" && <Handle type="target" position={Position.Left} className="p2-handle" />}
      <NodeGlyph data={data} />
      {(data.issue || data.runState === "failed") && <span className="p2-node-status error" title={data.issue ?? "本次试跑失败"}><AlertCircle size={14} /></span>}
      {!data.issue && data.runState === "succeeded" && <span className="p2-node-status success"><CheckCircle2 size={14} /></span>}
      {data.runState === "running" && <span className="p2-node-status"><LoaderCircle size={14} className="p2-spin" /></span>}
      {data.kind !== "result" && branches.length === 0 && <Handle type="source" position={Position.Right} className="p2-handle" />}
      {branches.map((b, i) => <div key={b.id} className="p2-branch-port" style={{ top: `${(i + 1) / (branches.length + 1) * 100}%` }}><span>{b.label}</span><Handle type="source" id={b.id} position={Position.Right} className="p2-handle" style={{ top: "50%" }} /></div>)}
    </div>
    {data.sourcePreview && <span className="p2-source-guide">正在选择此节点的输出</span>}
    <div className="p2-node-label">{data.label}</div>
    <div className="p2-node-sub">{data.flowId ? `Flow · ${getFlow(data)?.nodes.length} 步骤 · ${data.flowVersion}` : data.purpose ? modelNames[data.operatorId] : terminal ? data.operatorId === "control.start" ? "工作流输入" : "工作流输出" : data.operatorId}</div>
    {data.kind !== "result" && branches.length === 0 && !data.readOnly && <button className="p2-node-plus nodrag nopan" aria-label={`在${data.label}后添加节点`} onClick={(e) => { e.stopPropagation(); data.onAdd?.(id); }}><Plus size={14} /></button>}
    {data.flowId && <button className="p2-flow-expand nodrag nopan" onClick={(e) => { e.stopPropagation(); data.onExpand?.(id); }}><ChevronDown size={12} />展开步骤</button>}
  </div>;
}
function GroupNode({ id, data }: NodeProps<PhaseNode>) {
  return <div className="p2-flow-frame"><header><span><Workflow size={15} /><strong>{data.label}</strong><span className="p2-tag">Flow · {getFlow(data)?.nodes.length} 步骤</span><small>{data.flowVersion}</small></span><button className="nodrag nopan" onClick={(e) => { e.stopPropagation(); data.onExpand?.(id); }}><ChevronUp size={13} />收起</button></header><Handle type="target" position={Position.Left} className="p2-handle" style={{ top: 115 }} /><Handle type="source" position={Position.Right} className="p2-handle" style={{ top: 115 }} /></div>;
}
function InsertEdge(props: EdgeProps<PhaseEdge>) {
  const [path, x, y] = getBezierPath(props);
  const mappingFields = props.data?.mappingFields ?? [];
  return <><BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ stroke: props.selected ? "#168bff" : "#a5adb7", strokeWidth: props.selected ? 2 : 1.7 }} /><EdgeLabelRenderer>
    {mappingFields.length ? <button className="p2-edge-mapping nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${x}px,${y - 27}px)` }} title={mappingFields.map((field) => field.label).join("\n")} aria-label={`字段映射 · ${mappingFields.length} 项，点击查看第一项`} onClick={(event) => { event.stopPropagation(); props.data?.onMap?.(mappingFields[0].key); }}><GitBranch size={12} />字段映射 · {mappingFields.length}</button> : null}
    {props.data?.onInsert && <button className={`p2-edge-plus nodrag nopan ${props.selected ? "selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${x}px,${y}px)` }} aria-label="在线路中插入节点" onClick={(event) => { event.stopPropagation(); props.data?.onInsert?.(props.id); }}><Plus size={12} /></button>}
  </EdgeLabelRenderer></>;
}
const nodeTypes = { phase2: CompactNode, phase2group: GroupNode };
const edgeTypes = { phase2: InsertEdge };

function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={value} aria-label={label} className={`p2-switch ${value ? "on" : ""}`} onClick={() => onChange(!value)}><span /></button>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const el = ref.current;
    const controls = () => Array.from(el?.querySelectorAll<HTMLElement>("button:not(:disabled),input,select,textarea,[tabindex='0']") ?? []);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab") {
        const elements = controls(); const first = elements[0]; const last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    el?.addEventListener("keydown", key);
    return () => { el?.removeEventListener("keydown", key); prior?.focus(); };
  }, [onClose]);
  return <div className="p2-modal-backdrop"><div ref={ref} className="p2-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button aria-label="关闭对话框" onClick={onClose}><X size={18} /></button></header>{children}</div></div>;
}

function deliverable(node: PhaseNode) { return outputFields(node.data).filter((field) => node.data.purpose !== "understanding" || field.key.includes(".")); }
function deliverySelection(end: PhaseNode, nodes: PhaseNode[], edges: PhaseEdge[]) {
  return Array.isArray(end.data.config["交付字段"]) ? end.data.config["交付字段"].map(String) : edges.filter((edge) => edge.target === end.id).flatMap((edge) => { const node = nodes.find((item) => item.id === edge.source); return node ? deliverable(node).map((field) => `${node.id}|${field.key}`) : []; });
}
function ValidationReview({ nodes, edges, issues, onFocus, onRun, onAnalyze, onToggle }: { nodes: PhaseNode[]; edges: PhaseEdge[]; issues: Issue[]; onAnalyze: () => void; onFocus: (id: string, field?: string) => void; onRun: () => void; onToggle: (end: PhaseNode, value: string, checked: boolean) => void }) {
  return <div className="p2-validation-summary">
    <div className={`p2-validation-status ${issues.length ? "warning" : ""}`}><ShieldCheck size={19} /><strong>{issues.length ? `${issues.length} 项配置需要修复` : "配置检查通过"}</strong><span>字段定义已检查，实际值需试跑后查看</span><div className="p2-validation-actions">{issues.length > 0 && <Button variant="outline" onClick={onAnalyze}><Bot size={15} />AI 诊断并修复</Button>}<Button variant="outline" onClick={onRun} disabled={Boolean(issues.length)}>选择试跑输入</Button></div></div>
    {issues.map((issue, index) => <button className="p2-issue-row" key={`${issue.nodeId}-${index}`} onClick={() => onFocus(issue.nodeId, issue.field)}><AlertCircle size={15} /><strong>{nodes.find((node) => node.id === issue.nodeId)?.data.label}</strong><span>{issue.message}</span><ChevronRight size={15} /></button>)}
    <div className="p2-validation-fields"><section><h3>开始节点输入字段</h3><div className="p2-check-fields">{nodes.filter((node) => node.data.operatorId === "control.start").flatMap((node) => outputFields(node.data).map((field) => <button key={`${node.id}-${field.key}`} onClick={() => onFocus(node.id)}>{field.key}</button>))}</div></section>
    <section><h3>算子输出字段 <small>点击可查看节点配置</small></h3>{nodes.filter((node) => !node.data.readOnly && node.data.operatorId !== "control.start" && node.data.kind !== "result").map((node) => <div className="p2-node-output-row" key={node.id}><button className="p2-output-node" onClick={() => onFocus(node.id)}>{node.data.label}<ChevronRight size={12} /></button><div className="p2-check-fields">{deliverable(node).map((field) => <button key={field.key} title={`${node.data.label} · ${field.key} · ${field.type}`} onClick={() => onFocus(node.id, node.data.purpose === "understanding" ? "AI输出结构" : undefined)}>{field.key.includes(".") ? field.key.split(".").slice(1).join(".") : field.key}</button>)}</div></div>)}</section></div>
    {nodes.filter((node) => node.data.kind === "result").map((end) => {
      const options = upstreamOf(end.id, nodes, edges).flatMap((node) => deliverable(node).map((field) => ({ node, field, value: `${node.id}|${field.key}` })));
      const selected = deliverySelection(end, nodes, edges);
      return <section className="p2-delivery-review" key={end.id}><div className="p2-delivery-review-heading"><h3>{end.data.label} · 最终交付字段 <small>已选 {selected.length} 列</small></h3><button onClick={() => onFocus(end.id, "交付字段")}>前往结束节点<ChevronRight size={13} /></button></div><p>勾选要交付的列。这里与结束节点同步；取消只移出最终结果。</p><div className="p2-delivery-chips">{options.map(({ node, field, value }) => <label key={value} className={selected.includes(value) ? "selected" : ""}><input type="checkbox" checked={selected.includes(value)} onChange={(event) => onToggle(end, value, event.target.checked)} /><span><small>{node.data.label}</small><code>{field.key.includes(".") ? field.key.split(".").slice(1).join(".") : field.key}</code></span></label>)}{selected.filter((value) => !options.some((option) => option.value === value)).map((value) => <label key={value} className="invalid"><input type="checkbox" checked onChange={() => onToggle(end, value, false)} /><span>来源已失效：{value.split("|").slice(1).join("|")}</span></label>)}</div>{!selected.length && <p className="p2-error">至少选择一个交付字段后再校验。</p>}</section>;
    })}
  </div>;
}

function PrototypeInner() {
  const [initial] = useState(initialGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState<PhaseNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<PhaseEdge>(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>("ai");
  const [draft, setDraft] = useState<PhaseData | null>(clone(initial.nodes.find((n) => n.id === "ai")!.data));
  const [draftChanged, setDraftChanged] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ id: string | null } | null>(null);
  const [library, setLibrary] = useState(false);
  const [libraryMode, setLibraryMode] = useState<SearchMode>("operator");
  const activeCandidates = candidates;
  const activeFlows = useMemo(() => flowSource.filter((flow) => activeCandidates.some((candidate) => candidate.id === flow.id && canUseCapability(candidate))), [activeCandidates]);
  const [workspace, setWorkspace] = useState<{ id: string; title: string; origin?: DraftOrigin; returnId?: string }>({ id: "original", title: "视频内容标注" });
  const [recentDraftId, setRecentDraftId] = useState<string | null>(null);
  const forkSequence = useRef(0);
  const [addContext, setAddContext] = useState<{ source?: string; edge?: string } | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [schemaImport, setSchemaImport] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const [schemaError, setSchemaError] = useState("");
  const [importPreview, setImportPreview] = useState<ReturnType<typeof importOutputSchema> | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [inspectedEdge, setInspectedEdge] = useState<string | null>(null);
  const [aggregateRows, setAggregateRows] = useState<string[]>([]);
  const [dock, setDock] = useState<Dock>("none");
  const [expandedDock, setExpandedDock] = useState(false);
  const [dockHeight, setDockHeight] = useState(320);
  const [dockMaximized, setDockMaximized] = useState(false);
  const [sampleInput, setSampleInput] = useState("");
  const [trialSample, setTrialSample] = useState<TrialSample | null>(null);
  const [samplePreview, setSamplePreview] = useState<TrialSample | null>(null);
  const sampleUrls = useRef<string[]>([]);
  useEffect(() => () => sampleUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  const [run, setRun] = useState<Run | null>(null);
  const [runHistory, setRunHistory] = useState<Run[]>([]);
  const [viewedRunId, setViewedRunId] = useState<string | null>(null);
  const [retentionNow, setRetentionNow] = useState(Date.now);
  const [historyReady, setHistoryReady] = useState<string | null>(null);
  const [storageError, setStorageError] = useState("");
  const roundSequences = useRef<Record<string, number>>({});
  const loadedHistories = useRef(new Set<string>());
  const trialEntries = useMemo(() => activeTrials(run ? [run, ...runHistory.filter((item) => item.id !== run.id)] : runHistory, retentionNow), [run, runHistory, retentionNow]);
  const viewedRun = trialEntries.find((item) => item.id === viewedRunId) ?? trialEntries[0] ?? null;
  const [runNodeId, setRunNodeId] = useState("ai");
  const [failureDemo, setFailureDemo] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisContext | null>(null);
  const [diagnoses, setDiagnoses] = useState<Record<string, DiagnosisContext>>({});
  const [diagnoserEnabled, setDiagnoserEnabled] = useState(true);
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisReferences, setDiagnosisReferences] = useState<Record<string, NodeReference[]>>({});
  const [archivedDiagnoses, setArchivedDiagnoses] = useState<Record<string, { contexts: Record<string, DiagnosisContext>; references: Record<string, NodeReference[]>; revision: number; nodeIds: string[] }>>({});
  const [lastRepair, setLastRepair] = useState<{ plan: ConfigurationPlan; revision: number } | null>(null);
  const [threeColumns, setThreeColumns] = useState(false);
  const [revision, setRevision] = useState(1);
  const [saved, setSaved] = useState(true);
  const [canvasMode, setCanvasMode] = useState<"pan" | "select">("pan");
  const [notice, setNotice] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const history = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);
  const timers = useRef<number[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getZoom, getViewport, setViewport, screenToFlowPosition } = useReactFlow<PhaseNode, PhaseEdge>();

  useEffect(() => {
    const refresh = () => setRetentionNow(Date.now());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (loadedHistories.current.has(workspace.id)) { setHistoryReady(workspace.id); return; }
    loadTrialHistory<Run>(workspace.id, (url) => sampleUrls.current.push(url)).then(({ runs, sequence }) => {
      if (cancelled) return;
      setRunHistory(runs); roundSequences.current[workspace.id] = sequence;
      loadedHistories.current.add(workspace.id); setHistoryReady(workspace.id);
    }).catch(() => {
      if (cancelled) return;
      setStorageError("浏览器历史存储不可用，本次仅在当前页面保留，刷新后可能丢失。");
      loadedHistories.current.add(workspace.id); setHistoryReady(workspace.id);
    });
    return () => { cancelled = true; };
  }, [workspace.id]);
  useEffect(() => {
    if (historyReady !== workspace.id) return;
    saveTrialHistory(workspace.id, run ? [run, ...runHistory.filter((item) => item.id !== run.id)] : runHistory, roundSequences.current[workspace.id] ?? 0).then(() => setStorageError("")).catch(() => setStorageError("历史记录未能保存到浏览器，本次仅在当前页面保留。请检查浏览器存储空间。"));
  }, [run, runHistory, workspace.id, historyReady]);

  const rememberWorkspace = () => clone({
    workspace, nodes, edges, selectedId, draft, draftChanged, revision, saved,
    history: history.current, future: future.current, historyCounts, viewport: getViewport(),
    run, runHistory, viewedRunId, runNodeId, dock, expandedDock, dockHeight, dockMaximized, diagnosis, diagnoses, diagnosisReferences, diagnosisOpen,
    diagnoserEnabled, lastRepair, aggregateRows, advanced, previewSource,
    schemaImport, schemaText, schemaError, importPreview, sampleInput, trialSample, failureDemo,
  });
  const workspaces = useRef<Record<string, ReturnType<typeof rememberWorkspace>>>({});
  const archiveCurrentDiagnosis = () => setArchivedDiagnoses((previous) => ({ ...previous, [workspace.id]: { contexts: diagnoses, references: diagnosisReferences, revision, nodeIds: nodes.map((node) => node.id) } }));
  const restoreWorkspace = (id: string) => {
    if (run?.phase === "running") { setNotice("请等待当前试跑结束，再切换草稿"); return; }
    const previous = workspaces.current[id];
    if (!previous) { setNotice("此草稿已不在当前页面中"); return; }
    workspaces.current[workspace.id] = rememberWorkspace();
    archiveCurrentDiagnosis();
    setWorkspace(previous.workspace); setNodes(previous.nodes); setEdges(previous.edges);
    setSelectedId(previous.selectedId); setDraft(previous.draft); setDraftChanged(previous.draftChanged);
    setRevision(previous.revision); setSaved(previous.saved);
    history.current = previous.history; future.current = previous.future; setHistoryCounts(previous.historyCounts); setHistoryTick((value) => value + 1);
    setRun(previous.run); setRunHistory(previous.runHistory); setViewedRunId(previous.viewedRunId); setRunNodeId(previous.runNodeId); setDock(previous.dock); setExpandedDock(previous.expandedDock); setDockHeight(previous.dockHeight); setDockMaximized(previous.dockMaximized);
    setDiagnosis(previous.diagnosis); setDiagnoses(previous.diagnoses); setDiagnosisReferences(previous.diagnosisReferences);
    setDiagnosisOpen(previous.diagnosisOpen); setDiagnoserEnabled(previous.diagnoserEnabled); setLastRepair(previous.lastRepair);
    setAggregateRows(previous.aggregateRows); setAdvanced(previous.advanced); setPreviewSource(previous.previewSource);
    setSchemaImport(previous.schemaImport); setSchemaText(previous.schemaText); setSchemaError(previous.schemaError); setImportPreview(previous.importPreview);
    setSampleInput(previous.sampleInput); setTrialSample(previous.trialSample); setSamplePreview(null); setFailureDemo(previous.failureDemo);
    setLibrary(false); setThreeColumns(false); setMappingOpen(false); setPendingSelection(null); setPublishOpen(false);
    requestAnimationFrame(() => setViewport(previous.viewport));
    setNotice("已恢复草稿及未保存配置；修改版仍保留在当前页面");
  };
  const forkFlow = (candidate: Candidate) => {
    if (run?.phase === "running") { setNotice("请等待当前试跑结束，再创建修改版"); return; }
    const currentCandidate = activeCandidates.find((item) => item.id === candidate.id);
    const resolved = currentCandidate && selectCapabilityVersion(currentCandidate, candidate.flow?.version);
    if (!resolved?.flow) { setNotice("来源版本已不可用，请重新检索"); return; }
    try {
      const id = `flow-draft-${++forkSequence.current}-${crypto.randomUUID()}`;
      const created = buildFlowDraft(resolved.flow, id);
      const nextNodes: PhaseNode[] = created.nodes.map((node) => ({ ...node, data: { ...node.data, ...(understandingIds.includes(node.data.operatorId) ? { purpose: "understanding" as const, label: "AI 理解与标注" } : {}) } }));
      workspaces.current[workspace.id] = rememberWorkspace();
      archiveCurrentDiagnosis();
      setWorkspace({ id, title: `${resolved.name} · 修改版`, origin: created.origin, returnId: workspace.id }); setRecentDraftId(id);
      setNodes(nextNodes); setEdges(created.edges); setSelectedId(null); setDraft(null); setDraftChanged(false);
      setRevision(1); setSaved(false); history.current = []; future.current = []; setHistoryCounts({ undo: 0, redo: 0 });
      setRun(null); setRunHistory([]); setViewedRunId(null); setTrialSample(null); setSampleInput(""); setSamplePreview(null); setRunNodeId(""); setDock("none"); setExpandedDock(false); setDockHeight(320); setDockMaximized(false);
      setDiagnosis(null); setDiagnoses({}); setDiagnosisReferences({}); setDiagnosisOpen(false); setLastRepair(null);
      setAggregateRows([]); setAdvanced(false); setPreviewSource(null); setSchemaImport(false);
      setLibrary(false); setThreeColumns(false); setMappingOpen(false); setPendingSelection(null); setAddContext(null);
      setNotice(`已从 ${resolved.flow.version} 创建独立草稿，建议改动未自动应用；原草稿完整保留`);
      requestAnimationFrame(() => fitView({ nodes: nextNodes.map((node) => ({ id: node.id })), padding: 0.25, maxZoom: 1 }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "无法创建草稿，请检查来源"); }
  };

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(id); }, [notice]);
  const issues = useMemo(() => getIssues(nodes, edges), [nodes, edges]);
  const selected = nodes.find((n) => n.id === selectedId);
  const missing = issues.filter((i) => i.nodeId === selectedId);
  const op = draft && getOperator(draft.operatorId);
  const stale = Boolean(viewedRun && (viewedRun.revision !== revision || draftChanged));
  const changed = () => { setRevision((v) => v + 1); setSaved(false); };
  const capture = () => { history.current.push(clone({ nodes, edges })); future.current = []; setHistoryTick((v) => v + 1); setHistoryCounts({ undo: history.current.length, redo: 0 }); };
  const choose = (id: string | null, currentNodes = nodes) => {
    setSelectedId(id); setDraft(id ? clone(currentNodes.find((n) => n.id === id)!.data) : null);
    setDraftChanged(false); setAdvanced(false); setPreviewSource(null); setSchemaImport(false); setAggregateRows(String(id ? currentNodes.find((n) => n.id === id)?.data.config["聚合字段"] ?? "" : "").split(",").filter(Boolean));
  };
  const requestChoose = (id: string | null) => {
    if (id === selectedId) return;
    if (draftChanged) { setPendingSelection({ id }); return; } choose(id);
  };
  const assembledDraft = () => draft ? { ...draft, config: { ...draft.config, "聚合字段": aggregateRows.join(",") } } : null;
  const saveConfig = () => {
    if (!draft || !selectedId) return;
    capture(); setNodes((ns) => ns.map((n) => n.id === selectedId ? { ...n, data: assembledDraft()! } : n));
    setDraftChanged(false); changed(); setNotice("配置已保存");
  };
  const updateDraft = (updater: (d: PhaseData) => PhaseData) => { setDraft((d) => d ? updater(d) : d); setDraftChanged(true); };
  const config = (key: string, value: WorkflowConfigValue) => updateDraft((d) => ({ ...d, config: { ...d.config, [key]: value } }));
  const map = (key: string, value: string) => {
    if (!value) {
      updateDraft((d) => { const mappings = { ...d.mappings }; delete mappings[key]; return { ...d, mappings }; });
      return;
    }
    if (value === "workflow-input") { updateDraft((d) => ({ ...d, mappings: { ...d.mappings, [key]: { sourceType: "parameter", value: key } } })); return; }
    const [sourceId, ...rest] = value.split("|");
    const m: FieldMapping = sourceId === "fixed" ? { sourceType: "fixed", value: "" } : { sourceType: "upstream", sourceNodeId: sourceId, sourceField: rest.join("|") };
    updateDraft((d) => ({ ...d, mappings: { ...d.mappings, [key]: m } }));
  };
  const openLibrary = useCallback((ctx: { source?: string; edge?: string } | null = null) => {
    setLibraryMode("operator"); setLibrary(true); setExpandedDock(false); setAddContext(ctx); setThreeColumns(false);
  }, []);
  const addCandidate = (candidate: Candidate, dropPosition?: { x: number; y: number }) => {
    const currentCandidate = activeCandidates.find((item) => item.id === candidate.id);
    const selectedCandidate = currentCandidate && selectCapabilityVersion(currentCandidate, candidate.flow?.version);
    const c = selectedCandidate;
    if (!c || !canUseCapability(c)) { setNotice("该能力已不可用，请重新检索"); return; }
    if (draftChanged) { setNotice("请先保存当前节点配置，再添加节点"); return; }
    capture();
    const currentEdge = !dropPosition ? edges.find((e) => e.id === addContext?.edge) : undefined;
    const sourceNode = !dropPosition ? nodes.find((n) => n.id === (currentEdge?.source ?? addContext?.source)) : undefined;
    const targetNode = currentEdge && nodes.find((n) => n.id === currentEdge.target);
    const rect = stage.current?.getBoundingClientRect();
    const middle = screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2, y: (rect?.top ?? 100) + (rect?.height ?? 500) / 2 });
    const pos = dropPosition ?? (sourceNode ? currentEdge ? { x: sourceNode.position.x + 210, y: sourceNode.position.y } : nextNodePosition(sourceNode, nodes) : c.flow ? { x: middle.x, y: Math.max(middle.y, ...nodes.filter((n) => !n.parentId).map((n) => n.position.y + 165)) } : middle);
    const id = allocateNodeId();
    const node: PhaseNode = c.flow ? { id, type: "phase2", position: pos, data: { operatorId: c.id, label: c.name, kind: "flow", flowId: c.id, flowVersion: c.flow.version, source: c.source, config: {}, mappings: {}, validationCount: 0 } } : makeNode(c.operatorId ?? c.id, id, pos.x, pos.y, { ...(c.purpose ? { purpose: c.purpose, label: c.name } : {}) });
    // Insertion changes explicit edges; it never silently guesses field mappings.
    const nextNodes = [...nodes.map((n) => !dropPosition && targetNode && n.position.x >= targetNode.position.x && !n.parentId ? { ...n, position: { ...n.position, x: n.position.x + 210 } } : n), node];
    const nextEdges = currentEdge ? [...edges.filter((e) => e.id !== currentEdge.id), makeEdge(currentEdge.source, id, { sourceHandle: currentEdge.sourceHandle }), makeEdge(id, currentEdge.target, { targetHandle: currentEdge.targetHandle })] : sourceNode ? [...edges, makeEdge(sourceNode.id, id)] : edges;
    setNodes(nextNodes); setEdges(nextEdges); changed(); setNotice("节点已添加；请检查输入来源。可撤销添加与接线。");
    if (!dropPosition) {
      choose(id, nextNodes); setLibrary(false);
      window.setTimeout(() => setCenter(pos.x + 80, pos.y + 55, { zoom: Math.min(getZoom(), 1), duration: 220 }), 80);
    }

  };
  const dropCapability = (event: DragEvent<HTMLDivElement>) => {
    const value = event.dataTransfer.getData(CAPABILITY_DRAG_MIME);
    if (!value) return;
    event.preventDefault();
    const candidate = resolveCapabilityDrop(value, activeCandidates);
    if (!candidate) { setNotice("拖入的能力或版本已不可用，请重新检索"); return; }
    addCandidate(candidate, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  };
  const expandFlow = (id: string) => {
    const n = nodes.find((x) => x.id === id); const f = n && getFlow(n.data); if (!n || !f) return;
    if (draftChanged) { setNotice("请先保存当前配置"); return; }
    capture();
    const expanding = !n.data.expanded;
    if (selectedId === id) setDraft((d) => d ? { ...d, expanded: expanding } : d);
    const w = Math.max(440, f.nodes.length * 175 + 50);
    if (expanding) {
      const children = f.nodes.map((s, i) => ({ ...makeNode(s.operatorId, `${id}:step:${i}`, 45 + i * 175, 77, { readOnly: true, label: getOperator(s.operatorId)?.name ?? s.operatorId, config: { ...makeNode(s.operatorId, "temp", 0, 0).data.config, ...s.config } }), parentId: id, extent: "parent" as const, draggable: false }));
      const internalEdges = f.edges.map((e) => makeEdge(`${id}:step:${f.nodes.findIndex((s) => s.key === e.source)}`, `${id}:step:${f.nodes.findIndex((s) => s.key === e.target)}`));
      setNodes([...nodes.map((x) => x.id === id ? { ...x, type: "phase2group" as const, style: { width: w, height: 232 }, data: { ...x.data, expanded: true } } : x.position.x > n.position.x && !x.parentId && Math.abs(x.position.y - n.position.y) < 150 ? { ...x, position: { ...x.position, x: x.position.x + w - 160 } } : x), ...children]);
      setEdges((es) => [...es, ...internalEdges]);
    } else {
      setNodes(nodes.filter((x) => x.parentId !== id).map((x) => x.id === id ? { ...x, type: "phase2" as const, style: undefined, data: { ...x.data, expanded: false } } : !x.parentId && x.position.x > n.position.x && Math.abs(x.position.y - n.position.y) < 150 ? { ...x, position: { ...x.position, x: x.position.x - w + 160 } } : x));
      setEdges((es) => es.filter((e) => !e.source.startsWith(`${id}:step:`) && !e.target.startsWith(`${id}:step:`)));
      if (selected?.parentId === id) choose(id);
    }
    window.setTimeout(() => fitView({ nodes: [{ id }], padding: 0.18, maxZoom: 1, duration: 220 }), 100);
    // Expanding a reusable group is a viewing action, not a draft content change.
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (nodes.find((n) => n.id === connection.target)?.data.operatorId === "control.start" || nodes.find((n) => n.id === connection.source)?.data.kind === "result") return;
    if (upstreamOf(connection.source, nodes, edges).some((n) => n.id === connection.target)) { setNotice("不能连接成循环"); return; }
    if (edges.some((e) => e.source === connection.source && e.target === connection.target && e.sourceHandle === connection.sourceHandle)) return;
    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    const exactFields = sourceNode && targetNode ? availableOutputFields(sourceNode.id, nodes, edges) : [];
    let autoMapped = false;
    const nextNodes = sourceNode && targetNode ? nodes.map((node) => {
      if (node.id !== targetNode.id) return node;
      const mappings = { ...node.data.mappings };
      inputFields(node.data).forEach((input) => {
        if (mappings[input.key]) return;
        const output = exactFields.find((field) => fieldsExactlyMatch(field, input));
        if (output) {
          mappings[input.key] = { sourceType: "upstream", sourceNodeId: sourceNode.id, sourceField: output.key };
          autoMapped = true;
        }
      });
      return autoMapped ? { ...node, data: { ...node.data, mappings } } : node;
    }) : nodes;
    capture();
    if (autoMapped) setNodes(nextNodes);
    setEdges((es) => [...es, makeEdge(connection.source!, connection.target!, { sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle })]);
    changed();
    setNotice(autoMapped ? "连线已建立，完全一致的字段已自动绑定" : "连线已建立");
  };
  const undo = () => { const s = history.current.pop(); if (!s) return; future.current.push(clone({ nodes, edges })); setNodes(s.nodes); setEdges(s.edges); choose(null); changed(); setHistoryTick((v) => v + 1); setHistoryCounts({ undo: history.current.length, redo: future.current.length }); };
  const redo = () => { const s = future.current.pop(); if (!s) return; history.current.push(clone({ nodes, edges })); setNodes(s.nodes); setEdges(s.edges); choose(null); changed(); setHistoryTick((v) => v + 1); setHistoryCounts({ undo: history.current.length, redo: future.current.length }); };
  const removeSelected = () => {
    if (!selected || selected.data.readOnly) return;
    if (selected.data.operatorId === "control.start") { setNotice("开始节点需要保留"); return; }
    capture(); const ids = new Set(nodes.filter((n) => n.id === selectedId || n.parentId === selectedId).map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !ids.has(n.id))); setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target))); choose(null); changed();
  };
  const duplicate = () => {
    if (!selected || selected.data.readOnly || selected.data.operatorId === "control.start") return;
    capture(); const n = clone(selected); n.id = allocateNodeId(); n.position = { x: n.position.x + 35, y: n.position.y + 155 }; n.data.runState = "idle";
    n.type = "phase2"; n.style = undefined; n.data.expanded = false; n.selected = false;
    setNodes([...nodes, n]); choose(n.id, [...nodes, n]); changed();
  };
  const focusNode = (id: string, field?: string) => {
    const n = nodes.find((x) => x.id === id); if (!n) return;
    requestChoose(id);
    const parent = nodes.find((x) => x.id === n.parentId);
    setCenter(n.position.x + (parent?.position.x ?? 0) + 80, n.position.y + (parent?.position.y ?? 0) + 50, { zoom: Math.max(0.7, Math.min(getZoom(), 1)), duration: 200 });
    if (field) window.setTimeout(() => { const el = document.getElementById(`p2-field-${field}`); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); }, 180);
  };
  const validateDraft = (forTrial = false) => {
    if (draftChanged) { setNotice("请先保存当前配置再校验"); return false; }
    const start = nodes.find((node) => node.data.operatorId === "control.start");
    if (issues.some((issue) => !issue.field)) { setDock(forTrial ? "setup" : "validation"); setExpandedDock(true); setLibrary(false); setNotice("请先修复连通性问题，再倒推工作流输入"); return false; }
    if (start) {
      const automatic: { nodeId: string; key: string; sourceNodeId: string; sourceField: string }[] = [];
      const requirements = nodes.filter((node) => !node.data.readOnly && node.id !== start.id).flatMap((node) => {
        const upstream = upstreamOf(node.id, nodes, edges).filter((source) => source.id !== start.id);
        return inputFields(node.data).map((field) => {
          const candidates = findExactUpstreamFields(field, upstream, nodes, edges);
          const binding = node.data.mappings[field.key];
          if (!binding && candidates.length === 1) automatic.push({ nodeId: node.id, key: field.key, sourceNodeId: candidates[0].source.id, sourceField: candidates[0].field.key });
          return { nodeId: node.id, field, binding, suppliedUpstream: !binding && candidates.length === 1 };
        });
      });
      const derived = deriveWorkflowInputs(requirements, outputFields(start.data), start.id);
      // Keep fields explicitly used by saved expressions; validation will still check reachability.
      const referenced = outputFields(start.data).filter((field) => nodes.some((node) => Object.values(node.data.config).some((value) => typeof value === "string" && value.includes(`{${start.id}.outputs.${field.key}}`))));
      const fields = [...derived.fields, ...referenced.filter((field) => !derived.fields.some((item) => item.key === field.key))];
      const next = nodes.map((node) => ({ ...node, data: { ...node.data,
        config: node.id === start.id ? { ...node.data.config, 工作流输入字段: JSON.stringify(fields) } : node.data.config,
        mappings: { ...node.data.mappings, ...Object.fromEntries(automatic.filter((binding) => binding.nodeId === node.id).map((binding) => [binding.key, { sourceType: "upstream" as const, sourceNodeId: binding.sourceNodeId, sourceField: binding.sourceField }])), ...Object.fromEntries(derived.bindings.filter((binding) => binding.nodeId === node.id).map((binding) => [binding.key, { sourceType: "upstream" as const, sourceNodeId: start.id, sourceField: binding.key }])) },
      } }));
      if (JSON.stringify(next) !== JSON.stringify(nodes)) { capture(); setNodes(next); changed(); if (selectedId) choose(selectedId, next); }
      setNotice(derived.conflicts.length ? `输入 ${derived.conflicts.join("、")} 的定义冲突，请分别配置来源` : `已倒推 ${fields.length} 个工作流输入字段；已配置来源的入参不重复索取`);
    }
    setDock(forTrial ? "setup" : "validation"); setLibrary(false); setExpandedDock(true); setThreeColumns(false); return true;
  };
  const launchSetup = () => {
    if (run?.phase === "running") { setViewedRunId(null); setDock("run"); setExpandedDock(true); return; }
    if (draftChanged) { setNotice("请先保存当前节点配置，再试跑"); return; }
    validateDraft(true);
    setDock("setup"); setLibrary(false); setExpandedDock(true); setThreeColumns(false);
    requestAnimationFrame(() => fitView({ padding: 0.18, maxZoom: 1, duration: 180 }));
  };
  const startRun = () => {
    if (run?.phase === "running") return;
    if (historyReady !== workspace.id) { setNotice("正在读取历史记录，请稍候"); return; }
    const currentEntries = activeTrials(trialEntries);
    if (!trialCapacity(currentEntries)) { setDock("history"); setExpandedDock(true); setNotice(`历史试跑已达 ${TRIAL_LIMIT} 条，请删除记录后再试跑`); return; }
    if (draftChanged) { setNotice("请先保存当前节点配置，再试跑"); return; }
    if (!trialSample) { setNotice("请先选择一条试跑资源"); return; }
    if (issues.length) { setDock("setup"); setExpandedDock(true); setNotice("请先处理底部校验提示，再试跑"); return; }
    timers.current.forEach(window.clearTimeout); timers.current = [];
    const active = nodes.filter((node) => !node.data.readOnly);
    const failureNode = failureDemo ? active.find((node) => node.data.purpose)?.id : undefined;
    const result = simulateTrial(active.map((node) => ({
      id: node.id, label: node.data.label, operatorId: node.data.operatorId, kind: node.data.kind,
      inputs: inputFields(node.data), outputs: outputFields(node.data), config: node.data.config,
      mappings: node.data.mappings, outputRoot: node.data.purpose === "understanding" ? getOperator(node.data.operatorId)?.outputs[0]?.key : undefined, outputShape: node.data.purpose === "understanding" ? outputShape(node.data) : undefined,
    })), edges, trialSample, failureNode);
    const snapshot: Run = {
      id: `trial-${crypto.randomUUID()}`, createdAt: Date.now(), sequence: (roundSequences.current[workspace.id] ?? 0) + 1, failures: [], phase: "running", revision, count: 1,
      inputs: [String(trialSample.values.vid)], sample: clone(trialSample),
      records: Object.fromEntries(result.order.map((id) => [id, { nodeId: id, status: "queued", inputs: {}, config: {} }])),
      startedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }), nodes: clone(nodes), edges: clone(edges),
    };
    roundSequences.current[workspace.id] = snapshot.sequence!;
    setRunNodeId(trialResultNodes(active.map((node) => ({ ...node.data, id: node.id })), result.order)[0]?.id ?? "");
    if (run) setRunHistory((history) => retainTrial(history, run));
    setViewedRunId(null); setRun(snapshot); setDock("run"); setExpandedDock(true); setDiagnosisOpen(false);
    setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, runState: node.data.readOnly ? "idle" : "queued" } })));
    result.order.forEach((id, index) => {
      const record = result.records[id];
      timers.current.push(window.setTimeout(() => {
        if (record.status === "unexecuted") return;
        setRun((current) => current?.id === snapshot.id ? { ...current, records: { ...current.records, [id]: { ...record, status: "running", outputs: undefined, error: undefined } } } : current);
        setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, runState: "running" } } : node));
      }, 150 + index * 650));
      timers.current.push(window.setTimeout(() => {
        setRun((current) => current?.id === snapshot.id ? { ...current, records: { ...current.records, [id]: clone(record) } } : current);
        setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, runState: record.status === "unexecuted" ? "idle" : record.status === "failed" ? "failed" : "succeeded" } } : node));
      }, 700 + index * 650));
    });
    timers.current.push(window.setTimeout(() => {
      const failures = result.order.filter((id) => result.records[id].status === "failed").map((nodeId) => ({ nodeId, message: result.records[nodeId].error! }));
      const unexecutedIds = result.order.filter((id) => result.records[id].status === "unexecuted");
      const phase = failures.length || unexecutedIds.length ? "failed" : "passed";
      const completed: Run = { ...snapshot, records: result.records, failures, unexecutedIds, phase, failureNode: failures[0]?.nodeId, failureReason: failures.map((issue) => issue.message).join("；") };
      setRun(completed); setRunHistory((history) => retainTrial(history, completed));
      setNotice(phase === "passed" ? "本轮模拟完成，输入输出已保留在底部" : "本轮未完成，请查看底部节点记录");
    }, result.order.length * 650 + 150));
  };
  const openDiagnosis = (source: DiagnosisContext["source"], targetRun: Run | null = run) => {
    setDiagnoserEnabled(true);
    if (source === "trial" && (!targetRun || targetRun.phase === "running")) return;

    const context: DiagnosisContext = source === "trial" && targetRun ? {
      ...prototypeReferenceScope, id: targetRun.id, source, revision: targetRun.revision, recordedAt: targetRun.startedAt,
      phase: targetRun.phase === "failed" ? "failed" : "passed", inputCount: targetRun.count,
      nodes: diagnosisNodes(targetRun.nodes, targetRun.edges), issues: clone(targetRun.failures),
    } : {
      ...prototypeReferenceScope, id: `${source}-${revision}`, source, revision, recordedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      phase: issues.length ? "blocked" : "passed", inputCount: 0, nodes: diagnosisNodes(nodes, edges), issues: clone(issues),
    };
    const captured = diagnoses[context.id] ?? context;
    setDiagnoses((previous) => previous[context.id] ? previous : { ...previous, [context.id]: captured });
    setDiagnosis(captured);
    setDiagnosisOpen(true); setLibrary(false); setExpandedDock(true); setThreeColumns(false);
  };
  const referenceNode = (id: string) => {
    if (!diagnosis || !diagnosis.nodes.some((node) => node.id === id)) { setNotice("该节点不在当前诊断快照中，请从当前报错重新发起诊断"); return; }
    const reference = createNodeReference(diagnosis, id)!;
    setDiagnosisReferences((previous) => ({ ...previous, [diagnosis.id]: mergeNodeReferences(previous[diagnosis.id] ?? [], [reference]) }));
    setDiagnosisOpen(true); setNotice("节点引用已放入诊断输入区，发送后纳入本次对话");
  };
  const clipboardContext = referenceContext(nodes, revision);
  const selectedReference = () => selected ? createNodeReference(clipboardContext, selected.id) : null;
  const copyField = async (nodeId: string, direction: "inputs" | "outputs" | "csv", path: string) => {
    const reference = createFieldReference(clipboardContext, nodeId, direction, path);
    if (!reference) return;
    try { await navigator.clipboard.writeText(referenceToken(reference)); setNotice(`已完整复制 ${referenceToken(reference)}，可粘贴到配置${diagnoserEnabled ? "或诊断输入区" : ""}`); }
    catch { setNotice("复制失败，请聚焦该字段后按 Ctrl/Cmd+C 重试"); }
  };
  const fieldCopyButton = (nodeId: string, direction: "inputs" | "outputs" | "csv", path: string) => <button type="button" className="p2-copy-field" aria-label={`复制${direction === "csv" ? "CSV 表头" : direction === "inputs" ? "输入字段" : "输出字段"} ${path}`} title={`完整复制 ${direction === "csv" ? `{csv.${path}}` : `{${nodeId}.${direction}.${path}}`}`} onClick={() => copyField(nodeId, direction, path)} onCopy={(event) => { const ref = createFieldReference(clipboardContext, nodeId, direction, path); if (ref) { event.preventDefault(); event.stopPropagation(); event.clipboardData.setData("text/plain", referenceToken(ref)); setNotice("已复制完整字段引用"); } }}><code>{path}</code><Copy size={12} /></button>;
  const fieldPreview = (value: string) => {
    if (!(value.match(referencePattern)?.length)) return null;
    const sampleValue = (reference: NodeReference, seen = new Set<string>()): string | undefined => {
      const key = referenceToken(reference); if (seen.has(key)) return undefined; seen.add(key);
      const node = nodes.map((node) => node.id === selectedId && draft ? { ...node, data: draft } : node).find((node) => node.id === reference.nodeId);
      if (!node || !reference.field) return undefined;
      if (reference.field.direction === "inputs") {
        const mapping = node.data.mappings[reference.field.path];
        if (mapping?.sourceType === "fixed") return mapping.value;
        if (mapping?.sourceType === "upstream") {
          const source = createFieldReference(clipboardContext, mapping.sourceNodeId!, "outputs", mapping.sourceField!);
          return source ? sampleValue(source, seen) : undefined;
        }
        return undefined;
      }
      if (node.data.operatorId === "control.start") return sampleInput;
      if (reference.field.path === "tos_path") return "tos://demo/video.mp4";
      return undefined;
    };
    let preview: string;
    try { preview = expandFieldReferences(value, clipboardContext, (reference) => sampleValue(reference)); }
    catch (error) { preview = (error as Error).message; }
    return <details className="p2-csv-value-preview" open><summary>本条数据取值预览</summary><code>{preview}</code><small>仅一条本地样例；保存的仍是字段引用，正式执行解析需接口验收。</small></details>;
  };
  const copyNodeReference = async () => {
    const reference = selectedReference();
    if (!reference) return;
    try { await navigator.clipboard.writeText(referenceToken(reference)); setNotice(`节点 ID 已复制：${referenceToken(reference)}${diagnoserEnabled ? "，可粘贴到 Diagnoser" : "，当前阶段为纯文本"}`); }
    catch { setNotice("剪贴板复制失败，请聚焦画布后使用 Ctrl/Cmd+C 重试"); }
  };
  const copyCanvasReference = (event: ClipboardEvent<HTMLDivElement>) => {
    const editingText = Boolean((event.target as Element).closest("input,textarea,select,[contenteditable=true]"));
    const selectionCount = selectedId ? Math.max(1, nodes.filter((node) => node.selected).length) : 0;
    if (!canCopyCanvasNode({ canvasFocused: true, editingText, selectedText: Boolean(window.getSelection()?.toString()), selectionCount })) {
      if (!editingText && selectionCount > 1) setNotice("请先单选一个节点，再复制节点引用");
      return;
    }
    const reference = selectedReference(); if (!reference) return;
    event.preventDefault();
    event.clipboardData.setData(NODE_REFERENCE_MIME, JSON.stringify(reference));
    event.clipboardData.setData("text/plain", referenceToken(reference));
    setNotice(`节点 ID 已复制：${referenceToken(reference)}${diagnoserEnabled ? "，可粘贴到 Diagnoser" : "，当前阶段为纯文本"}`);
  };
  const applyRepair = (plan: ConfigurationPlan): RepairOutcome => {
    try {
      const context = diagnoses[plan.recordId];
      if (!context || context.id !== plan.recordId) throw new Error("修复方案与诊断记录不一致");
      if (draftChanged) throw new Error("请先保存或放弃正在编辑的节点配置，再应用方案");
      const next = applyConfigurationPlan(nodes, plan, revision);
      const count = getIssues(next, edges).length;
      capture(); setNodes(next); changed(); if (selectedId && next.some((node) => node.id === selectedId)) choose(selectedId, next);
      setLastRepair({ plan, revision: revision + 1 });
      return { ok: true, revision: revision + 1, message: `已应用 ${plan.changes.length} 项配置变更，${count ? `校验仍有 ${count} 项问题` : "配置校验通过"}。请主动试跑验证结果。` };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "配置方案应用失败" }; }
  };
  const undoRepair = (plan: ConfigurationPlan): RepairOutcome => {
    try {
      if (draftChanged) throw new Error("请先保存或放弃正在编辑的配置，再撤销本次应用");
      if (!lastRepair || lastRepair.plan.id !== plan.id || lastRepair.revision !== revision) throw new Error("应用后草稿已有其他变化，请使用画布撤销逐步恢复，避免覆盖修改");
      const next = applyConfigurationPlan(nodes, reverseConfigurationPlan(plan, revision), revision);
      capture(); setNodes(next); changed(); if (selectedId && next.some((node) => node.id === selectedId)) choose(selectedId, next);
      setLastRepair(null);
      return { ok: true, revision: revision + 1, message: "已撤销本次配置应用，恢复应用前的字段绑定与配置。" };
    } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "撤销失败" }; }
  };
  const keyedNodes = nodes.map((n) => ({ ...n, selected: n.id === selectedId, data: { ...n.data, sourcePreview: n.id === previewSource, issue: issues.find((i) => i.nodeId === n.id)?.message, onAdd: (id: string) => openLibrary({ source: id }), onReference: diagnoserEnabled && diagnosis && diagnosis.nodes.some((node) => node.id === n.id) ? referenceNode : undefined, onExpand: expandFlow } }));
  const keyedEdges = edges.map((e) => {
    const target = nodes.find((node) => node.id === e.target);
    const mappingFields = target ? Object.entries(target.data.mappings).filter(([, binding]) => binding.sourceType === "upstream" && binding.sourceNodeId === e.source).map(([key, binding]) => ({ key, label: `${nodes.find((node) => node.id === binding.sourceNodeId)?.data.label ?? "来源已失效"} · 输出字段 ${binding.sourceField} → 输入 ${key}` })) : [];
    return { ...e, className: previewSource && e.source === previewSource && e.target === selectedId ? "p2-source-edge" : "", data: { ...e.data, mappingFields, onMap: (field: string) => focusNode(e.target, field), onInsert: target?.data.readOnly ? undefined : (id: string) => openLibrary({ edge: id }) } };
  });

  const renderConfigField = (f: { key: string; type: string; required?: boolean; constraints?: string }) => {
    const value = draft?.config[f.key] ?? "";
    const selections = f.constraints?.match(/selections:([^;]+)/)?.[1]?.split(",") ?? [];
    const boolean = f.type === "Boolean";
    return <div className="p2-config-block" key={f.key}><label htmlFor={`p2-field-${f.key}`}>{f.key}{f.required && <em>*</em>}</label>{boolean ? <Switch label={f.key} value={Boolean(value)} onChange={(v) => config(f.key, v)} /> : selections.length ? <select id={`p2-field-${f.key}`} value={String(value)} onChange={(e) => config(f.key, e.target.value)}><option value="">请选择</option>{selections.map((s) => <option key={s}>{s}</option>)}</select> : ["Int", "Float", "Number"].includes(f.type) ? <Input id={`p2-field-${f.key}`} type="number" value={String(value)} onChange={(e) => config(f.key, e.target.value === "" ? "" : Number(e.target.value))} /> : <><ReferenceTextEditor id={`p2-field-${f.key}`} label={f.key} value={String(value)} context={clipboardContext} disabled={draft?.readOnly} onChange={(value) => config(f.key, value)} />{fieldPreview(String(value))}</> }</div>;
  };
  const renderInspector = (wide = false) => {
    if (!draft || !selectedId) return null;
    const displayNodes = nodes.map((node) => node.id === selectedId ? { ...node, data: draft } : node);
    const sourceNodes = upstreamOf(selectedId, displayNodes, edges);
    const deliveryFields = sourceNodes.flatMap((node) => availableOutputFields(node.id, displayNodes, edges).filter((field) => node.data.purpose !== "understanding" || field.key.includes(".")).map((field) => ({ node, field, value: `${node.id}|${field.key}` })));
    const endInputs = edges.filter((edge) => edge.target === selectedId).flatMap((edge) => {
      const sourceNode = displayNodes.find((node) => node.id === edge.source);
      return sourceNode ? availableOutputFields(sourceNode.id, displayNodes, edges).filter((field) => sourceNode.data.purpose !== "understanding" || field.key.includes(".")).map((field) => `${sourceNode.id}|${field.key}`) : [];
    });
    const configuredDelivery = Array.isArray(draft.config["交付字段"]) ? draft.config["交付字段"].map(String) : endInputs;
    const setDelivery = (value: string, checked: boolean) => {
      const next = configuredDelivery.filter((item) => item !== value);
      if (checked) next.push(value);
      config("交付字段", next);
    };
    const aiShape = outputShape(draft);
    const baseOutput = (getOperator(draft.operatorId)?.outputs ?? [])[0];
    const generatedSchema = buildOutputSchema(aiShape);
    const prompt = String(draft.config["提示词"] ?? "");
    const promptFormatConflict = Boolean(draft.purpose === "understanding" && (/(json|schema|输出格式|输出字段)/i.test(prompt) || aiShape.some((field) => field.key.length > 1 && prompt.toLowerCase().includes(field.key.toLowerCase()))));
    const updateShape = (next: OutputShapeField[]) => config("AI输出结构", JSON.stringify(next));
    const referenceCount = (field: OutputShapeField) => nodes.reduce((count, node) => count + (node.id === selectedId ? 0 : Object.values(node.data.mappings).filter((binding) => binding.sourceType === "upstream" && binding.sourceNodeId === selectedId && binding.sourceField === outputColumnPath(field.key, baseOutput?.key)).length + (Array.isArray(node.data.config["交付字段"]) ? node.data.config["交付字段"].filter((value) => value === `${selectedId}|${baseOutput?.key}.${field.key}`).length : 0)), 0);
    const example = Object.fromEntries(aiShape.map((field) => [field.key, field.type === "Boolean" ? true : ["Int", "Float"].includes(field.type) ? 1 : field.choices?.[0] ?? field.description ?? "示例文本"]));
    return <aside className={`p2-inspector ${wide ? "wide" : ""}`} aria-label="节点配置抽屉">
    <header><button aria-label="关闭节点配置" onClick={() => { if (wide) setThreeColumns(false); else requestChoose(null); }}><X size={20} /></button><div><strong>{draft?.label}</strong>{draft?.purpose && <small>{draft.operatorId}</small>}</div><button className="p2-expand-button" aria-label="展开输入配置输出对照" title="展开输入／配置／输出" onClick={() => { setThreeColumns(true); setLibrary(false); setExpandedDock(false); }}><Maximize2 size={16} /></button></header>
    <div className="p2-inspector-scroll">
      {draft?.readOnly && <div className="p2-callout">Flow 内部步骤只读 · 配置来自引用版本</div>}
        {missing.length > 0 && !draft?.readOnly && <div className="p2-inspector-issues"><button className="p2-incomplete" onClick={() => focusNode(selectedId!, missing[0].field)}><AlertCircle size={15} /><span>{missing.length} 项待检查 · 点击定位</span><ChevronRight size={14} /></button><Button variant="outline" size="sm" onClick={() => { if (draftChanged) { setNotice("请先保存当前配置，再诊断对应报错"); return; } openDiagnosis("validation"); }}><Bot size={15} />AI 诊断并修复</Button></div>}
        {draft?.purpose && <div className="p2-fixed-operator"><span>AI 算子</span><strong>{modelNames[draft.operatorId]}</strong></div>}
        {draft?.flowId && <div className="p2-flow-details"><h3>整组工作流 <span className="p2-tag">{draft.source === "custom" ? "用户工作流" : "研发发布"}</span></h3><p>{getFlow(draft)?.description}</p><code>{draft.flowId} · {draft.flowVersion}</code>{getFlow(draft)?.nodes.map((s, i) => <div key={s.key}><span>{i + 1}</span><strong>{getOperator(s.operatorId)?.name ?? s.operatorId}</strong><code>{s.operatorId}</code></div>)}<Button variant="outline" onClick={() => expandFlow(selectedId!)}>{draft.expanded ? "收起" : "展开"}组内步骤</Button></div>}
        {draft.operatorId === "control.start" && <section><h3>工作流输入</h3><p className="p2-field-help">先连接并配置各算子，再点击“校验”：上游没有产出的输入追加到这里；映射到中间节点输出的输入不再重复索取。固定配置沿用工作流原有输入规则。</p>{!outputFields(draft).length && <p className="p2-callout">尚未倒推输入，不预置候选字段。</p>}<button className="p2-dashed-add" onClick={() => validateDraft()}><FileCheck2 size={15} />倒推输入并校验</button></section>}
        <section><h3>输入字段</h3><p className="p2-field-help">点击字段可复制完整引用，用于提示词等文本配置。下方映射它的来源：选择可达上游输出；没有上游产出时，校验会将它追加到开始节点。</p><div className="p2-field-tags">{inputFields(draft!).length ? inputFields(draft!).map((f) => <span key={f.key}>{fieldCopyButton(selectedId!, "inputs", f.key)}</span>) : <small>无固定输入字段</small>}</div>
          {inputFields(draft!).length > 0 && <><div className="p2-section-label">输入来源 <small>可搜索全部可达上游</small></div>{inputFields(draft!).map((f) => {
            const m = draft?.mappings[f.key];
            const value = m?.sourceType === "upstream" ? `${m.sourceNodeId}|${m.sourceField}` : m?.sourceType === "parameter" ? "workflow-input" : m?.sourceType === "fixed" ? "fixed" : "";
            const available = sourceNodes.flatMap((n) => availableOutputFields(n.id, displayNodes, edges).map((o) => ({ node: n, field: o, value: `${n.id}|${o.key}` })));
            const valid = available.some((a) => a.value === value);
            const sourceName = sourceNodes.find((node) => node.id === m?.sourceNodeId)?.data.label;
            return <div className="p2-binding" key={f.key}><label htmlFor={`p2-field-${f.key}`}>{f.key}{f.required && <em>*</em>}<small>{f.type}{f.cardinality === "many" ? "[]" : ""}</small></label>{m?.sourceType === "upstream" && <div className={`p2-binding-current ${valid ? "" : "invalid"}`}><strong>{sourceName ?? "来源已失效"}</strong><span>输出 <code>{m.sourceField}</code></span><ChevronRight size={14} /><span>输入 <code>{f.key}</code></span></div>}<SourcePicker allowFixed={false} id={`p2-field-${f.key}`} value={value} disabled={draft.readOnly} options={[...available.map((a) => ({ value: a.value, nodeId: a.node.id, nodeLabel: a.node.data.label, field: a.field.key, type: a.field.type, compatible: fieldsCompatible(a.field, f) })), { value: "workflow-input", nodeId: nodes.find((node) => node.data.operatorId === "control.start")?.id ?? "start", nodeLabel: "工作流输入（开始节点）", field: f.key, type: f.type, compatible: true }]} onChange={(value) => map(f.key, value)} onPreview={setPreviewSource} />{missing.find((i) => i.field === f.key) && <small className="p2-error">{missing.find((i) => i.field === f.key)?.message}</small>}</div>;
          })}</>}
        </section>
        {draft.operatorId === "control.result" ? <section><h3>流程交付字段</h3><p className="p2-field-help">取消选择只会从流程最终结果中移除字段，不会删除节点产出；之后可重新勾选。</p><div className="p2-delivery-list">{deliveryFields.map(({ node, field, value }) => <label key={value}><input type="checkbox" checked={configuredDelivery.includes(value)} onChange={(event) => setDelivery(value, event.target.checked)} /><span><strong>{node.data.label}<span className="p2-source-divider">输出</span><code>{field.key}</code></strong><small>{field.type}</small></span></label>)}{configuredDelivery.filter((value) => !deliveryFields.some((option) => option.value === value)).map((value) => <label className="invalid" key={value}><input type="checkbox" checked onChange={() => setDelivery(value, false)} /><span><strong>来源已失效 · {value.split("|").slice(1).join("|")}</strong><small>移除失效交付引用</small></span></label>)}{deliveryFields.length === 0 && <small>上游还没有可交付字段。</small>}</div></section> : draft.purpose === "understanding" ? null : <section><h3>输出字段</h3><div className="p2-field-tags output">{outputFields(draft).length ? outputFields(draft).map((field) => <span key={field.key}>{fieldCopyButton(selectedId!, "outputs", field.key)}</span>) : <small>按实际配置产生输出</small>}</div></section>}
        {!draft?.flowId && !draft?.readOnly && <>
          {op?.config.filter((f) => !/超时|阶段QPS|阶段并发|自动重命名|跳过/.test(f.key)).map(renderConfigField)}
          {draft.purpose === "understanding" && <section className="p2-output-shape" id="p2-field-AI输出结构"><div className="p2-shape-heading"><h3>AI 输出列</h3><button onClick={() => { setSchemaText(""); setSchemaError(""); setImportPreview(null); setSchemaImport(true); }}>导入已有 Schema</button></div><p className="p2-field-help">一列一个字段，直接用于 CSV 和下游节点。修改这里会自动生成平级 JSON Schema，提示词只需描述标注任务。</p>{promptFormatConflict && <div className="p2-callout warning">提示词中可能已有输出格式，请核对是否与下方输出列一致；原提示词会保留。</div>}{outputShapeErrors(aiShape).map((error) => <p className="p2-error" key={error}>{error}</p>)}<div className="p2-shape-table-head"><span>列名</span><span>内容类型</span><span>必填</span></div>{aiShape.map((field, index) => { const references = referenceCount(field); return <div className="p2-column-row" key={index}><div className="p2-column-controls"><Input aria-label={`AI 输出字段 ${index + 1}`} value={field.key} placeholder="如 title" onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, key: event.target.value } : item))} /><select aria-label={`${field.key || "新字段"} 类型`} value={field.type} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, type: event.target.value, choices: undefined } : item))}>{!(field.type in columnTypes) && <option value={field.type}>需调整：{field.type}</option>}{Object.entries(columnTypes).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select><input aria-label={`${field.key || "新字段"}必填`} type="checkbox" checked={field.required} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, required: event.target.checked } : item))} /><button aria-label={`删除输出字段 ${field.key}`} onClick={() => updateShape(aiShape.filter((_, row) => row !== index))}><X size={14} /></button></div><Input aria-label={`${field.key || "新字段"}说明`} value={field.description} placeholder="这列标注什么？如：视频标题，20 字以内" onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} /><div className="p2-column-foot"><span><GitBranch size={12} />输出列 {field.key ? fieldCopyButton(selectedId!, "outputs", outputColumnPath(field.key, baseOutput?.key)) : <code>待命名</code>} · 下游可引用</span><small>{references ? `${references} 处已引用` : "尚无显式引用"}</small></div>{references > 0 && <small className="p2-shape-impact">删除或改名会使已有引用失效，保存后会提示修复。</small>}{field.type === "String" && <details className="p2-column-rules"><summary>限定可选值{field.choices?.length ? ` · ${field.choices.length} 项` : "（选填）"}</summary><Input aria-label={`${field.key || "新字段"}可选值`} placeholder="如：体育，新闻，生活；留空表示不限" value={field.choices?.join("，") ?? ""} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, choices: event.target.value.split(/[,，]/).filter(Boolean) } : item))} /></details>}</div>; })}<button className="p2-dashed-add" onClick={() => { let key = `field_${aiShape.length + 1}`; while (aiShape.some((field) => field.key === key)) key += "_new"; updateShape([...aiShape, { key, type: "String", required: true, description: "" }]); }}><Plus size={16} />添加输出列</button><details className="p2-schema-preview"><summary>查看生成的 JSON Schema 与输出示例</summary><strong>JSON Schema · 自动生成</strong><pre>{JSON.stringify(generatedSchema, null, 2)}</pre><strong>平级输出示例 · 每个字段对应一列</strong><pre>{JSON.stringify(example, null, 2)}</pre></details></section>}
          {draft?.operatorId === "phase2.ratio" && <><div className="p2-config-block"><label>分支数</label><select value={Number(draft.config["分支数"] ?? 2)} onChange={(e) => config("分支数", Number(e.target.value))}>{[2, 3, 4, 5].map((v) => <option key={v}>{v}</option>)}</select></div>{Array.from({ length: Number(draft.config["分支数"] ?? 2) }, (_, i) => renderConfigField({ key: `分支${i + 1}比例`, type: "Int" }))}<p>比例合计需为 100%，按实际到达数据分配</p></>}
          {draft?.operatorId === "control.condition" && <section><h3>有序条件分流</h3><p>从上到下首条命中</p>{getConditionRules(draft.config).map((r, i) => <div key={r.id} className="p2-config-block"><label>{i + 1}. {r.label}</label><Textarea aria-label={r.label} value={r.expression} onChange={(e) => updateDraft((d) => ({ ...d, config: { ...d.config, 分流规则: getConditionRules(d.config).map((x) => x.id === r.id ? { ...x, expression: e.target.value } : x) } }))} /></div>)}<div className="p2-callout">Else · 承接未命中条件的数据</div></section>}
          {op?.kind === "handler" && <section className="p2-runtime"><h3>运行参数</h3><p className="p2-field-help">QPS 按算子预设阈值控制，此处无需重复配置。</p>{op.config.filter((f) => /超时|阶段并发/.test(f.key)).map(renderConfigField)}{Object.entries(runtimeDefaults).filter(([key]) => !op.config.some((f) => f.key.startsWith(key))).map(([key, value]) => <div className="p2-config-block" key={key}><label htmlFor={`p2-field-${key}`}>{key}</label><Input id={`p2-field-${key}`} type="number" min={1} value={String(draft.config[key] ?? value)} onChange={(event) => config(key, event.target.value === "" ? "" : Number(event.target.value))} /></div>)}</section>}
          {draft.operatorId !== "control.start" && draft.kind !== "result" && <section><button className="p2-section-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>高级设置 <small>跳过算子 · 自动重命名</small></span>{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>{advanced && <><div className="p2-config-block"><label>跳过算子</label><Switch label="跳过算子" value={Boolean(draft.config["跳过"])} onChange={(value) => config("跳过", value)} /><small>启用后跳过本节点；已有下游来源仍需校验。</small></div><div className="p2-config-block"><label>自动重命名</label><Switch label="自动重命名" value={Boolean(draft.config["自动重命名"])} onChange={(value) => config("自动重命名", value)} /></div></>}</section>}
          {["control.aggregate", "phase2.merge"].includes(draft.operatorId) && <section><div className="p2-section-label blue">聚合字段 <small>{aggregateRows.length} 项</small></div>{aggregateRows.map((v, i) => <div key={i} className="p2-form-row"><Input aria-label={`聚合字段${i + 1}`} placeholder="字段名" value={v} onChange={(e) => { setAggregateRows((rows) => rows.map((x, j) => j === i ? e.target.value : x)); setDraftChanged(true); }} /><button aria-label="删除聚合字段" onClick={() => { setAggregateRows((rows) => rows.filter((_, j) => j !== i)); setDraftChanged(true); }}><X size={14} /></button></div>)}<button className="p2-dashed-add" onClick={() => { setAggregateRows([...aggregateRows, ""]); setDraftChanged(true); }}><Plus size={17} />新增聚合字段</button></section>}
        </>}
        {op?.description && <p className="p2-purpose-copy">{op.description}</p>}
    </div>
    <footer>{selectedId && <button className="p2-reference-selected" onClick={copyNodeReference} title="也可聚焦画布后按 Ctrl/Cmd+C"><Copy size={14} />复制节点引用</button>}{diagnoserEnabled && diagnosis && <button className="p2-reference-selected" onClick={() => referenceNode(selectedId!)}><MessageSquarePlus size={14} />引用到诊断</button>}<span>{draft?.readOnly ? "引用版本 · 只读" : draftChanged ? "配置未保存" : "配置已保存"}</span>{!draft?.readOnly && <Button onClick={saveConfig}>保存配置</Button>}</footer>
    </aside>;
  };

  const toggleDelivery = (end: PhaseNode, value: string, checked: boolean) => {
    if (draftChanged) { setNotice("请先保存右侧配置，再调整交付字段"); return; }
    const values = deliverySelection(end, nodes, edges).filter((item) => item !== value); if (checked) values.push(value);
    capture(); const nextNodes = nodes.map((node) => node.id === end.id ? { ...node, data: { ...node.data, config: { ...node.data.config, "交付字段": values } } } : node);
    setNodes(nextNodes); if (selectedId === end.id) setDraft(clone(nextNodes.find((node) => node.id === end.id)!.data)); changed();
  };

  // Inactive workspaces keep mounted panels so conversations and unsent input survive a return.
  const diagnosisWorkspaces = { ...archivedDiagnoses, [workspace.id]: { contexts: diagnoses, references: diagnosisReferences, revision, nodeIds: nodes.map((node) => node.id) } };
  const viewTrial = (id: string) => {
    const record = trialEntries.find((item) => item.id === id);
    if (!record) return;
    setViewedRunId(id);
    setRunNodeId(trialResultNodes(record.nodes.map((node) => ({ ...node.data, id: node.id })), Object.keys(record.records))[0]?.id ?? "");
    setDock("run"); setExpandedDock(true); setLibrary(false);
  };
  const editTrial = (id: string, change: { note?: string; kept?: boolean }) => {
    if (!trialEntries.some((item) => item.id === id && item.phase !== "running")) return;
    setRun((current) => current ? updateTrialMetadata([current], id, change)[0] : null);
    setRunHistory((current) => updateTrialMetadata(current, id, change));
    setRetentionNow(Date.now());
  };
  const removeTrial = (id: string) => {
    const item = trialEntries.find((entry) => entry.id === id);
    if (!item || item.kept || item.phase === "running") return;
    setRun((current) => current ? deleteTrial([current], id)[0] ?? null : null);
    setRunHistory((current) => deleteTrial(current, id));
    if (viewedRunId === id) setViewedRunId(null);
    if (diagnosis?.id === id) { setDiagnosis(null); setDiagnosisOpen(false); }
    setDiagnoses((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setDiagnosisReferences((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)));
    setNotice("已删除本轮记录，可以继续试跑");
  };
  const canvasBottom = dock === "none" ? "0px" : expandedDock ? dockMaximized ? "calc(100% - 100px)" : `min(${dockHeight + 28}px, calc(100% - 150px))` : "76px";
  return <div className="p2-app" data-history-tick={historyTick}>
    <header className="p2-platform-header"><strong>AI 数据服务平台</strong><div><span>当前项目</span><User size={17} /><span>admin</span></div></header>
    <nav className="p2-platform-rail" aria-label="平台导航"><User size={19} /><span className="active"><Workflow size={19} /></span><Database size={19} /><Settings2 size={19} /></nav>
    <header className="p2-workflow-header"><div><div><h1>Pipeline 编排 <span>{workspace.title}</span></h1><p>草稿 · {saved ? "已保存" : "未保存"} <span>当前内容版本 {revision}</span></p></div></div><div className="p2-header-actions"><Button variant="outline" onClick={() => setNotice("版本管理暂不可用")}><History size={16} />版本管理</Button><Button variant="outline" onClick={() => validateDraft()}><FileCheck2 size={16} />校验{issues.length > 0 && <span className="p2-count">{issues.length}</span>}</Button><Button variant="outline" onClick={launchSetup}><Play size={16} />试跑</Button><Button variant="outline" onClick={() => { if (draftChanged) { setNotice("请先保存节点配置，再保存草稿"); return; } setSaved(true); setNotice("草稿已保存"); }}><Save size={16} />保存</Button><Button onClick={() => { if (draftChanged || issues.length) { setNotice("请先保存配置并处理校验提示"); setDock("validation"); setLibrary(false); setExpandedDock(true); return; } setPublishOpen(true); }}><CheckCircle2 size={16} />上线</Button></div></header>
    {(workspace.origin || (recentDraftId && recentDraftId !== workspace.id)) && <div className="p2-draft-origin"><span>{workspace.origin ? <>独立修改版 · 来源 <strong>{workspace.origin.name}</strong> · {workspace.origin.flowId} · {workspace.origin.version}</> : "原草稿已恢复，刚才的修改版仍保留在当前页面。"}</span>{workspace.returnId ? <button onClick={() => restoreWorkspace(workspace.returnId!)}>返回上一草稿（保留修改版）</button> : recentDraftId && <button onClick={() => restoreWorkspace(recentDraftId)}>继续编辑修改版</button>}</div>}
    <main className={`p2-workspace ${workspace.origin || (recentDraftId && recentDraftId !== workspace.id) ? "has-origin" : ""} ${selectedId && !threeColumns ? "has-inspector" : ""}`}>
      <div className="p2-central">
        <div className="p2-canvas" style={{ bottom: canvasBottom }} ref={stage} tabIndex={0} aria-label="工作流画布" onCopy={copyCanvasReference} onPointerDown={(event) => { if (!(event.target as Element).closest("input,textarea,select,button,[contenteditable=true]")) event.currentTarget.focus({ preventScroll: true }); }}>
          <ReactFlow onDrop={dropCapability} onDragOver={(event) => { if (event.dataTransfer.types.includes(CAPABILITY_DRAG_MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} nodes={keyedNodes} edges={keyedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStart={capture} onNodeDragStop={() => { changed(); }} onConnect={onConnect} onNodeClick={(_, n) => requestChoose(n.id)} onPaneClick={() => requestChoose(null)} onEdgeClick={(_, edge) => { if (draftChanged) { setNotice("请先保存当前配置"); return; } setEdges((es) => es.map((e) => ({ ...e, selected: e.id === edge.id }))); setInspectedEdge(edge.id); setMappingOpen(true); }} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.3} maxZoom={1.5} panOnDrag={canvasMode === "pan"} selectionOnDrag={canvasMode === "select"} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#dce0e6" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap position="bottom-right" style={{ width: 120, height: 76 }} pannable zoomable nodeColor="#dbe8f8" />
          </ReactFlow>
          <FloatingDock items={[
            { title: "添加节点", icon: <Plus size={17} />, onClick: () => library ? setLibrary(false) : openLibrary(), active: library, className: "p2-toolbar-add" },
            { title: "撤销", icon: <Undo2 size={17} />, onClick: undo, disabled: !historyCounts.undo, separator: true },
            { title: "重做", icon: <Redo2 size={17} />, onClick: redo, disabled: !historyCounts.redo },
            { title: "拖动画布", icon: <Hand size={17} />, onClick: () => setCanvasMode("pan"), active: canvasMode === "pan", separator: true },
            { title: "框选节点", icon: <MousePointer2 size={17} />, onClick: () => setCanvasMode("select"), active: canvasMode === "select" },
            { title: "创建节点副本", icon: <Copy size={17} />, onClick: duplicate, disabled: !selected || selected.data.readOnly || selected.data.operatorId === "control.start", separator: true },
            { title: "删除选中节点", icon: <Trash2 size={17} />, onClick: removeSelected, disabled: !selected || selected.data.readOnly || selected.data.operatorId === "control.start" },
            { title: "显示完整流程", icon: <Focus size={17} />, onClick: () => fitView({ padding: 0.3, duration: 200 }) },
            { title: "打开 Diagnoser", label: "Diagnoser", icon: <Bot size={17} />, separator: true, className: "p2-toolbar-diagnoser", active: diagnosisOpen, onClick: () => {
              if (diagnosis) { setDiagnoserEnabled(true); setDiagnosisOpen(true); return; }
              if (draftChanged) { setNotice("请先保存当前配置，再发起诊断"); return; }
              openDiagnosis("draft");
            } },
          ]} />
          <CapabilityDiscovery open={library} mode={libraryMode} candidates={activeCandidates} flows={activeFlows} sourceOperatorId={libraryMode === "operator" ? nodes.find((node) => node.id === (edges.find((edge) => edge.id === addContext?.edge)?.source ?? addContext?.source))?.data.operatorId : undefined} contextLabel={addContext?.edge ? "插入到当前连线" : addContext?.source ? `添加到 ${nodes.find((node) => node.id === addContext.source)?.data.label} 后` : undefined} onClose={() => setLibrary(false)} onMode={setLibraryMode} onAdd={addCandidate} onFork={forkFlow} />
          {threeColumns && draft && <div className="p2-three-columns"><header><strong>输入 · 配置 · 输出对照</strong><button onClick={() => setThreeColumns(false)}><ArrowLeft size={15} />返回画布</button></header><div><section><h3>输入定义</h3><p>本次试跑数据统一在底部结果区查看。</p>{inputFields(draft).map((f) => <div className="p2-config-block" key={f.key}><label>{f.key}</label><small>{f.type} · {f.semanticType}</small><code>来源：{draft.mappings[f.key]?.sourceField ?? "未绑定"}</code></div>)}</section>{renderInspector(true)}<section><h3>输出定义</h3><p>以下为字段定义；实际产出见底部试跑结果。</p>{outputFields(draft).map((f) => <div className="p2-config-block" key={f.key}><label>{f.key}</label><small>{f.type}</small></div>)}</section></div></div>}
        </div>
        {dock !== "none" && <TrialDock height={dockHeight} setHeight={setDockHeight} maximized={dockMaximized} setMaximized={setDockMaximized} className={`${dock === "validation" ? "validation" : ""} ${library ? "with-library" : ""} ${selectedId && !threeColumns ? "with-inspector" : ""}`} expanded={expandedDock} onExpanded={(expanded) => { if (expanded) setLibrary(false); setExpandedDock(expanded); }}
          title={dock === "validation" ? `校验 · ${issues.length ? `${issues.length} 项待检查` : "通过"}` : dock === "setup" ? "试跑 · 样本准备" : dock === "history" ? "历史试跑" : viewedRun?.phase === "running" ? "试跑中" : viewedRun?.phase === "passed" ? "试跑完成" : "试跑未完成"}
          meta={dock === "validation" ? "检查配置，不执行数据" : dock === "setup" ? "每轮一条资源" : dock === "history" ? `${trialEntries.length} 轮记录` : viewedRun ? `第 ${viewedRun.sequence ?? viewedRun.id.split("-").at(-1)} 次 · ${viewedRun.startedAt} · 快照 ${viewedRun.revision}` : ""}
          actions={<>{dock === "run" && viewedRun?.phase !== "running" && <><Button variant="outline" size="sm" onClick={() => openDiagnosis("trial", viewedRun)}><Bot size={15} />{viewedRun?.phase === "failed" ? "AI 诊断并修复" : "结果不符合预期？"}</Button><button onClick={launchSetup}>再次试跑</button></>}{!expandedDock && <button onClick={() => { setDock("history"); setExpandedDock(true); setLibrary(false); }}>历史试跑 · {trialEntries.length}</button>}</>}>
          {dock !== "validation" && <nav className="p2-trial-tabs" aria-label="试跑视图"><button aria-current={dock === "setup" ? "page" : undefined} onClick={launchSetup}>样本准备</button><button aria-current={dock === "run" ? "page" : undefined} disabled={!viewedRun} onClick={() => { setDock("run"); setExpandedDock(true); }}>试跑结果</button><button aria-current={dock === "history" ? "page" : undefined} onClick={() => setDock("history")}>历史试跑 · {trialEntries.length}</button></nav>}

          <div className="p2-dock-content">{dock === "validation" ? <ValidationReview nodes={nodes} edges={edges} issues={issues} onFocus={focusNode} onRun={launchSetup} onAnalyze={() => openDiagnosis("validation")} onToggle={toggleDelivery} /> : dock === "history" ? <TrialRunHistory runs={trialEntries} selectedId={viewedRun?.id} onSelect={viewTrial} onEdit={editTrial} onDelete={removeTrial} storageError={storageError} /> : dock === "setup" ? <>
            {issues.length > 0 && <div className="p2-trial-blockers" role="status"><strong>配置尚未通过校验，暂不能开始试跑</strong>{issues.map((issue, index) => <button key={`${issue.nodeId}-${index}`} onClick={() => focusNode(issue.nodeId, issue.field)}><AlertCircle size={14} /><span>{nodes.find((node) => node.id === issue.nodeId)?.data.label} · {issue.message}</span><ChevronRight size={13} /></button>)}<Button variant="outline" size="sm" onClick={() => validateDraft(true)}>重新校验</Button></div>}
            <TrialSamplePreparation sample={trialSample} revision={revision} blocked={Boolean(issues.length) || !trialCapacity(trialEntries) || historyReady !== workspace.id} limitReached={!trialCapacity(trialEntries)} onHistory={() => setDock("history")} onChange={(sample) => { setTrialSample(sample); setSampleInput(sample ? String(sample.values.vid) : ""); }} onRun={startRun} onView={setSamplePreview} onNotice={setNotice} onLocalUrl={(url) => sampleUrls.current.push(url)} />
          </> : viewedRun ? <TrialRunDetails nodes={viewedRun.nodes.map((node) => ({ ...node.data, id: node.id }))} records={viewedRun.records} sample={viewedRun.sample} phase={viewedRun.phase} revision={viewedRun.revision} stale={stale} selectedNodeId={runNodeId} onSelect={setRunNodeId} onFocus={focusNode} onView={setSamplePreview} onNotice={setNotice} /> : null}</div>
        </TrialDock>}

      </div>
      {selectedId && draft && !threeColumns && renderInspector()}
    </main>
    {samplePreview && <Modal title="查看试跑资源" onClose={() => setSamplePreview(null)}><TrialSamplePreview sample={samplePreview} /></Modal>}
    {Object.entries(diagnosisWorkspaces).flatMap(([owner, entry]) => Object.values(entry.contexts).map((context) => <DiagnosisPanel key={`${owner}:${context.id}`} context={context} records={Object.values(entry.contexts)} visible={owner === workspace.id && diagnoserEnabled && diagnosisOpen && diagnosis?.id === context.id} draftRevision={entry.revision} references={entry.references[context.id] ?? []} liveNodeIds={entry.nodeIds}
      onAddReferences={(references) => setDiagnosisReferences((previous) => ({ ...previous, [context.id]: mergeNodeReferences(previous[context.id] ?? [], references) }))}
      onSelectRecord={(id) => { setDiagnosis(diagnoses[id]); setDiagnosisOpen(true); }}
      onRemoveReference={(key) => setDiagnosisReferences((previous) => ({ ...previous, [context.id]: (previous[context.id] ?? []).filter((item) => nodeReferenceKey(item) !== key) }))}
      onMinimize={() => setDiagnosisOpen(false)} onViewErrors={() => {
        if (context.source === "trial") {
          if (trialEntries.some((item) => item.id === context.id)) viewTrial(context.id);
          else setNotice("此轮试跑已不在当前草稿中，请查看对话保留的依据");
          return;
        }
        if (revision !== context.revision) { setNotice("当前记录已成为历史快照，请在本对话的问题点与证据中查看当时的报错"); return; }
        setDock("validation"); setExpandedDock(true); setLibrary(false);
      }}
      onFocus={(id, field) => { const node = nodes.find((item) => item.id === id); if (!node) { setNotice("该节点已从当前草稿移除，请对照诊断快照排查"); return; } focusNode(id, node.data.purpose === "understanding" && outputShape(node.data).some((item) => item.key === field || field?.endsWith(`.${item.key}`)) ? "AI输出结构" : field); }}
      onApply={applyRepair} onUndo={undoRepair} onNotice={setNotice} />))}
    <footer className="p2-status-footer"><span>当前项目 · 用户工作流草稿</span><span>复制节点引用：选中节点后 Ctrl/Cmd+C　缩放：滚轮</span></footer>
    {notice && <div className="p2-toast" role="status"><Info size={16} />{notice}</div>}
    {pendingSelection && <Modal title="当前节点配置尚未保存" onClose={() => setPendingSelection(null)}><p>切换节点前，保留或放弃本次修改。</p><footer><Button variant="outline" onClick={() => setPendingSelection(null)}>继续编辑</Button><Button variant="outline" onClick={() => { choose(pendingSelection.id); setPendingSelection(null); }}>放弃修改</Button><Button onClick={() => { const nextNodes = nodes.map((n) => n.id === selectedId && draft ? { ...n, data: clone(assembledDraft()!) } : n); capture(); setNodes(nextNodes); changed(); choose(pendingSelection.id, nextNodes); setPendingSelection(null); }}>保存并切换</Button></footer></Modal>}
    {mappingOpen && <Modal title="连线与字段来源" onClose={() => setMappingOpen(false)}><p>连线表达处理顺序。输入绑定在目标节点抽屉中配置，可搜索全部可达上游字段。</p><p>字段类型或结构不兼容时，需显式使用字段映射／转换；接线不会自动猜测对应关系。</p><footer><Button variant="outline" onClick={() => { const edge = edges.find((e) => e.id === inspectedEdge); if (edge && !nodes.find((n) => n.id === edge.target)?.data.readOnly) { setMappingOpen(false); focusNode(edge.target); } }}>配置目标节点</Button><Button variant="outline" disabled={Boolean(nodes.find((n) => n.id === edges.find((e) => e.id === inspectedEdge)?.target)?.data.readOnly)} onClick={() => { capture(); setEdges((es) => es.filter((e) => e.id !== inspectedEdge)); changed(); setMappingOpen(false); setNotice("连线已删除，可撤销；请检查输入绑定"); }}>删除连线</Button><Button onClick={() => setMappingOpen(false)}>返回画布</Button></footer></Modal>}
    {schemaImport && <Modal title="导入已有 JSON Schema" onClose={() => setSchemaImport(false)}><p>粘贴项目经理已有的 Schema，先预览再替换当前输出列。嵌套字段会展开为平级列，文本列表会改为逗号分隔的文本；业务提示词由你核对。</p><Textarea aria-label="已有 JSON Schema" rows={7} placeholder={'{"type":"object","properties":{...}}'} value={schemaText} onChange={(event) => { setSchemaText(event.target.value); setImportPreview(null); setSchemaError(""); }} />{schemaError && <p className="p2-error" role="alert">{schemaError}</p>}{importPreview && <div className="p2-import-preview"><strong>将生成 {importPreview.fields.length} 个平级输出列</strong>{importPreview.changes.map((change) => <p key={change}>{change}</p>)}<div className="p2-check-fields">{importPreview.fields.map((field) => <span key={field.key}>{field.key}</span>)}</div><small>导入会替换现有列；删除或改名的已有下游引用将提示失效。</small></div>}<footer><Button variant="outline" onClick={() => setSchemaImport(false)}>取消</Button><Button variant="outline" onClick={() => { try { setImportPreview(importOutputSchema(schemaText)); setSchemaError(""); } catch (error) { setSchemaError(error instanceof Error ? error.message : "Schema 无法解析"); } }}>预览输出列</Button><Button disabled={!importPreview} onClick={() => { if (importPreview) { config("AI输出结构", JSON.stringify(importPreview.fields)); setSchemaImport(false); setNotice("输出列已导入，请核对提示词并保存配置"); } }}>应用输出列</Button></footer></Modal>}
    {publishOpen && <Modal title="上线固定版本" onClose={() => setPublishOpen(false)}><p>上线将固定当前草稿内容，后续修改继续保留为草稿。</p><div className="p2-callout">当前草稿 {revision} · 基础检查通过</div><footer><Button variant="outline" onClick={() => setPublishOpen(false)}>返回编排</Button><Button onClick={() => { setPublishOpen(false); setNotice("上线服务尚未连接，当前草稿已保留"); }}>确认上线</Button></footer></Modal>}
  </div>;
}

export function Phase2Prototype() { return <ReactFlowProvider><PrototypeInner /></ReactFlowProvider>; }
