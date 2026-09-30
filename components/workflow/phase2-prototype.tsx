"use client";

// Throwaway interaction prototype. One focused direction follows the user's
// minimal-change brief. ?prototype=phase2 keeps the existing prototype intact.
// No company source, production API, persistence, or real execution is used.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, Handle,
  MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider, getBezierPath,
  useEdgesState, useNodesState, useReactFlow, type Connection, type Edge,
  type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react";
import {
  AlertCircle, ArrowLeft, Bot, CheckCircle2, ChevronDown, ChevronRight,
  ChevronUp, Copy, Database, FileCheck2, FileOutput, Focus, GitBranch, Hand,
  History, ImageIcon, Info, Layers, LoaderCircle, Maximize2, MousePointer2, Play, Plus,
  Redo2, Save, Search, Settings2, ShieldCheck, Split, Trash2, Undo2, User,
  Video, Workflow, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createNode, domainLabels, fieldsCompatible, fieldsExactlyMatch, getOperator, getOperatorRoutes, getConditionRules, operators, publishedFlows,
  type FieldMapping, type FlowDefinition, type OperatorField,
  type WorkflowNodeData, type WorkflowConfigValue,
} from "@/app/lib/workflow";
import { FloatingDock } from "@/components/ui/floating-dock";
import { SourcePicker } from "./source-picker";
import { buildOutputSchema, columnTypes, importOutputSchema, outputShapeErrors, type OutputShapeField } from "./output-schema";
import "./phase2-prototype.css";

type PhaseData = WorkflowNodeData & {
  purpose?: "understanding" | "generation";
  source?: "engineering" | "custom";
  expanded?: boolean;
  readOnly?: boolean;
  issue?: string;
  sourcePreview?: boolean;
  onAdd?: (id: string) => void;
  onExpand?: (id: string) => void;
};
type PhaseNode = Node<PhaseData, "phase2" | "phase2group">;
type PhaseEdge = Edge<{ onInsert?: (id: string) => void; mappingFields?: { key: string; label: string }[]; onMap?: (field: string) => void }, "phase2">;
type Candidate = {
  id: string; name: string; description: string; domains: string[];
  kind: "node" | "flow"; source: "engineering" | "custom";
  operatorId?: string; purpose?: PhaseData["purpose"]; flow?: FlowDefinition;
};
type Issue = { nodeId: string; field?: string; message: string };
type Run = {
  phase: "running" | "passed" | "failed";
  revision: number; count: number; startedAt: string;
  nodes: PhaseNode[]; edges: PhaseEdge[]; inputs: string[]; unexecutedIds?: string[]; failureNode?: string; failureReason?: string;
};
type Dock = "none" | "validation" | "setup" | "run";
type Snapshot = { nodes: PhaseNode[]; edges: PhaseEdge[] };
let prototypeNodeSequence = 10;
function allocateNodeId() { return `p2-${++prototypeNodeSequence}`; }

const understandingIds = ["ai-platform.gemini", "ai-platform.deepseek", "ai-platform.qwen_tmp1"];
const groupedIds = new Set([...understandingIds, "ai-platform.seedream.img2img", "control.transform"]);
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
const customFlow: FlowDefinition = {
  ...publishedFlows.find((f) => f.id === "flow.video-preview")!,
  id: "custom_video_preview_demo", name: "项目视频预览", version: "V2",
  description: "演示用户工作流：基于生成视频预览方案，使用 480p 参数。",
  nodes: publishedFlows.find((f) => f.id === "flow.video-preview")!.nodes.map((n) => ({ ...n, config: { ...n.config, ...(/transcoding.start|get/.test(n.operatorId) ? { "清晰度(选填240p/360p/480p/720p)": "480p" } : {}) } })),
};
const customFlowV1: FlowDefinition = { ...customFlow, version: "V1", description: "演示用户工作流 V1：沿用 720p 预览参数。", nodes: publishedFlows.find((f) => f.id === "flow.video-preview")!.nodes };
const flowSource = [...publishedFlows, customFlow, customFlowV1];
const candidates: Candidate[] = [
  { id: "purpose.understanding", name: "AI 理解与标注", description: "在节点内选择模型，配置提示词和输入字段。", domains: ["ai-labeling", "video", "image"], kind: "node", source: "engineering", operatorId: "ai-platform.gemini", purpose: "understanding" },
  { id: "purpose.generation", name: "AI 图片生成", description: "选择图片生成模型，配置输入图片与提示词。", domains: ["image", "ai-labeling"], kind: "node", source: "engineering", operatorId: "ai-platform.seedream.img2img", purpose: "generation" },
  ...operators.filter((o) => !groupedIds.has(o.id) && !["control.wait", "control.start", "control.split", "control.aggregate"].includes(o.id)).map((o) => ({ id: o.id, name: o.name, description: o.description, domains: o.domains, kind: "node" as const, source: "engineering" as const, operatorId: o.id })),
  { id: "phase2.ratio", name: "比例分流", description: "按配置比例分配到多条互斥分支。", domains: ["control"], kind: "node", source: "engineering" },
  { id: "phase2.merge", name: "合流", description: "将字段结构一致的多路记录合并到下游。", domains: ["control"], kind: "node", source: "engineering" },
  ...[...publishedFlows, customFlow].map((f) => ({ id: f.id, name: f.name, description: f.description, domains: f.domains, kind: "flow" as const, source: (f.id.startsWith("custom_") ? "custom" : "engineering") as Candidate["source"], flow: f })),
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
  transfer.data.mappings = { vid: { sourceType: "upstream", sourceNodeId: "start", sourceField: "vid" } };
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
  if (data.operatorId === "control.start") return [
    { key: "vid", type: "String", semanticType: "media_locator.vod_id", cardinality: "one" },
    { key: "tos_path", type: "String", semanticType: "media_locator.tos", cardinality: "one" },
    { key: "rowkey", type: "String", semanticType: "system.resource_id", cardinality: "one" },
  ];
  const flow = getFlow(data);
  const declared = getOperator(flow?.nodes.at(-1)?.operatorId ?? data.operatorId)?.outputs ?? [];
  if (data.purpose !== "understanding") return declared;
  const base = declared[0];
  if (!base) return declared;
  return [...declared, ...outputShape(data).filter((field) => field.key.trim()).map((field) => ({ key: `${base.key}.${field.key}`, type: field.type, semanticType: `field.json.${field.key}`, cardinality: field.type === "List" ? "many" : "one" }))];
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
function findExactUpstreamField(input: OperatorField, upstream: PhaseNode[], nodes: PhaseNode[], edges: PhaseEdge[]) {
  return upstream.flatMap((source) => availableOutputFields(source.id, nodes, edges).map((field) => ({ source, field }))).find(({ field }) => fieldsExactlyMatch(field, input));
}
function upstreamOf(id: string, nodes: PhaseNode[], edges: PhaseEdge[]) {
  const seen = new Set<string>();
  const walk = (target: string) => edges.filter((e) => e.target === target).forEach((e) => { if (!seen.has(e.source)) { seen.add(e.source); walk(e.source); } });
  walk(id); return nodes.filter((n) => seen.has(n.id) && !n.data.readOnly);
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
        if (!findExactUpstreamField(f, upstream, nodes, edges)) issues.push({ nodeId: n.id, field: f.key, message: `请选择 ${f.key} 的输入来源` });
        return;
      }
      if ((m.sourceType === "fixed" || m.sourceType === "parameter") && !m.value) { issues.push({ nodeId: n.id, field: f.key, message: `请选择 ${f.key} 的输入来源` }); return; }
      if (m.sourceType === "upstream") {
        const source = upstream.find((s) => s.id === m.sourceNodeId);
        const field = source && availableOutputFields(source.id, nodes, edges).find((x) => x.key === m.sourceField);
        const fallback = !field ? findExactUpstreamField(f, upstream, nodes, edges) : undefined;
        const resolvedField = field ?? fallback?.field;
        if (!resolvedField) issues.push({ nodeId: n.id, field: f.key, message: `${f.key} 的来源已失效，请重新绑定` });
        else if (!fieldsCompatible(resolvedField, f)) issues.push({ nodeId: n.id, field: f.key, message: `${f.key} 与来源的类型或结构不匹配，请显式转换` });
      }
    });
    const requiredKeys = new Set(inputFields(n.data).filter((field) => field.required && !field.system).map((field) => field.key));
    Object.entries(n.data.mappings).filter(([key, binding]) => !requiredKeys.has(key) && binding.sourceType === "upstream").forEach(([key, binding]) => {
      const source = upstream.find((item) => item.id === binding.sourceNodeId);
      const target = inputFields(n.data).find((item) => item.key === key);
      const field = source && availableOutputFields(source.id, nodes, edges).find((item) => item.key === binding.sourceField);
      const fallback = !field && target ? findExactUpstreamField(target, upstream, nodes, edges) : undefined;
      const resolvedField = field ?? fallback?.field;
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
function NodeGlyph({ data }: { data: PhaseData }) {
  if (data.flowId) return <Workflow size={30} strokeWidth={1.7} />;
  if (data.purpose === "generation") return <ImageIcon size={30} strokeWidth={1.7} />;
  if (data.purpose) return <Bot size={30} strokeWidth={1.7} />;
  if (data.operatorId === "control.start") return <Play size={30} strokeWidth={1.7} />;
  if (data.kind === "result") return <FileOutput size={30} strokeWidth={1.7} />;
  if (data.operatorId.includes("ratio")) return <Split size={30} strokeWidth={1.7} />;
  if (data.kind === "control") return <GitBranch size={30} strokeWidth={1.7} />;
  if (getOperator(data.operatorId)?.domains.includes("video")) return <Video size={30} strokeWidth={1.7} />;
  return <Layers size={30} strokeWidth={1.7} />;
}

function CompactNode({ id, data, selected }: NodeProps<PhaseNode>) {
  const terminal = data.operatorId === "control.start" || data.kind === "result";
  const branches = data.operatorId === "phase2.ratio" ? Array.from({ length: Number(data.config["分支数"] ?? 2) }, (_, i) => ({ id: `branch-${i}`, label: `${data.config[`分支${i + 1}比例`] ?? 0}%` })) : getOperatorRoutes(data.operatorId, data.config);
  return <div className={`p2-node ${selected ? "is-selected" : ""} ${terminal ? "is-terminal" : ""} ${data.flowId ? "is-flow" : ""} ${data.issue ? "is-error" : ""} ${data.sourcePreview ? "is-source-preview" : ""}`}>
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
    {mappingFields.length ? <button className="p2-edge-mapping nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${x}px,${y - 20}px)` }} title={mappingFields.map((field) => field.label).join("\n")} aria-label={`字段映射 · ${mappingFields.length} 项，点击查看第一项`} onClick={(event) => { event.stopPropagation(); props.data?.onMap?.(mappingFields[0].key); }}><GitBranch size={12} />字段映射 · {mappingFields.length}</button> : null}
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
function ValidationReview({ nodes, edges, issues, onFocus, onRun, onToggle }: { nodes: PhaseNode[]; edges: PhaseEdge[]; issues: Issue[]; onFocus: (id: string, field?: string) => void; onRun: () => void; onToggle: (end: PhaseNode, value: string, checked: boolean) => void }) {
  return <div className="p2-validation-summary">
    <div className={`p2-validation-status ${issues.length ? "warning" : ""}`}><ShieldCheck size={19} /><strong>{issues.length ? `${issues.length} 项配置需要修复` : "配置检查通过"}</strong><span>字段定义已检查，实际值需试跑后查看</span><Button variant="outline" onClick={onRun} disabled={Boolean(issues.length)}>选择试跑输入</Button></div>
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
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"engineering" | "custom" | "all">("engineering");
  const [kind, setKind] = useState<"all" | "node" | "flow">("all");
  const [domain, setDomain] = useState("all");
  const [customVersion, setCustomVersion] = useState("V2");
  const [candidateDetail, setCandidateDetail] = useState<string | null>(null);
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
  const [modelWarning, setModelWarning] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"config" | "result">("config");
  const [dock, setDock] = useState<Dock>("none");
  const [expandedDock, setExpandedDock] = useState(false);
  const [sampleInput, setSampleInput] = useState("demo_vid_001");
  const [run, setRun] = useState<Run | null>(null);
  const [runSampleIndex, setRunSampleIndex] = useState(0);
  const [failureDemo, setFailureDemo] = useState(false);
  const [diagnosis, setDiagnosis] = useState(false);
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
  const { fitView, setCenter, getZoom, screenToFlowPosition } = useReactFlow<PhaseNode, PhaseEdge>();

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4000); return () => window.clearTimeout(id); }, [notice]);
  const issues = useMemo(() => getIssues(nodes, edges), [nodes, edges]);
  const selected = nodes.find((n) => n.id === selectedId);
  const missing = issues.filter((i) => i.nodeId === selectedId);
  const op = draft && getOperator(draft.operatorId);
  const currentRunNode = run?.nodes.find((n) => n.id === selectedId);
  const stale = Boolean(run && run.revision !== revision);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((c) => (source === "all" || c.source === source) && (kind === "all" || c.kind === kind) && (domain === "all" || c.domains.includes(domain)) && (!q || [c.id, c.name, c.description, ...(c.purpose === "understanding" ? [...understandingIds, "Gemini", "DeepSeek", "Qwen"] : []), ...(c.flow?.nodes.map((n) => `${n.operatorId} ${getOperator(n.operatorId)?.name ?? ""}`) ?? [])].join(" ").toLowerCase().includes(q)));
  }, [query, source, kind, domain]);
  const changed = () => { setRevision((v) => v + 1); setSaved(false); };
  const capture = () => { history.current.push(clone({ nodes, edges })); future.current = []; setHistoryTick((v) => v + 1); setHistoryCounts({ undo: history.current.length, redo: 0 }); };
  const choose = (id: string | null, currentNodes = nodes) => {
    setSelectedId(id); setDraft(id ? clone(currentNodes.find((n) => n.id === id)!.data) : null);
    setDraftChanged(false); setInspectorTab("config"); setModelWarning(""); setAdvanced(false); setPreviewSource(null); setSchemaImport(false); setAggregateRows(String(id ? currentNodes.find((n) => n.id === id)?.data.config["演示聚合字段"] ?? "" : "").split(",").filter(Boolean));
  };
  const requestChoose = (id: string | null) => {
    if (id === selectedId) return;
    if (draftChanged) { setPendingSelection({ id }); return; } choose(id);
  };
  const assembledDraft = () => draft ? { ...draft, config: { ...draft.config, "演示聚合字段": aggregateRows.join(",") } } : null;
  const saveConfig = () => {
    if (!draft || !selectedId) return;
    capture(); setNodes((ns) => ns.map((n) => n.id === selectedId ? { ...n, data: assembledDraft()! } : n));
    setDraftChanged(false); changed(); setNotice("配置已保存到演示草稿");
  };
  const updateDraft = (updater: (d: PhaseData) => PhaseData) => { setDraft((d) => d ? updater(d) : d); setDraftChanged(true); };
  const config = (key: string, value: WorkflowConfigValue) => updateDraft((d) => ({ ...d, config: { ...d.config, [key]: value } }));
  const map = (key: string, value: string) => {
    if (!value) {
      updateDraft((d) => { const mappings = { ...d.mappings }; delete mappings[key]; return { ...d, mappings }; });
      return;
    }
    const [sourceId, ...rest] = value.split("|");
    const m: FieldMapping = sourceId === "fixed" ? { sourceType: "fixed", value: "" } : { sourceType: "upstream", sourceNodeId: sourceId, sourceField: rest.join("|") };
    updateDraft((d) => ({ ...d, mappings: { ...d.mappings, [key]: m } }));
  };
  const openLibrary = useCallback((ctx: { source?: string; edge?: string } | null = null) => {
    setLibrary(true); setExpandedDock(false); setQuery(""); setCandidateDetail(null); setAddContext(ctx); setThreeColumns(false);
  }, []);
  const addCandidate = (candidate: Candidate) => {
    const c = candidate.source === "custom" ? { ...candidate, flow: customVersion === "V1" ? customFlowV1 : customFlow } : candidate;
    if (draftChanged) { setNotice("请先保存当前节点配置，再添加节点"); return; }
    capture();
    const currentEdge = edges.find((e) => e.id === addContext?.edge);
    const sourceNode = nodes.find((n) => n.id === (currentEdge?.source ?? addContext?.source));
    const targetNode = currentEdge && nodes.find((n) => n.id === currentEdge.target);
    const rect = stage.current?.getBoundingClientRect();
    const middle = screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2, y: (rect?.top ?? 100) + (rect?.height ?? 500) / 2 });
    const pos = sourceNode ? { x: sourceNode.position.x + 210, y: sourceNode.position.y + (currentEdge ? 0 : 165) } : c.flow ? { x: middle.x, y: Math.max(middle.y, ...nodes.filter((n) => !n.parentId).map((n) => n.position.y + 165)) } : middle;
    const id = allocateNodeId();
    const node: PhaseNode = c.flow ? { id, type: "phase2", position: pos, data: { operatorId: c.id, label: c.name, kind: "flow", flowId: c.id, flowVersion: c.flow.version, source: c.source, config: {}, mappings: {}, validationCount: 0 } } : makeNode(c.operatorId ?? c.id, id, pos.x, pos.y, { ...(c.purpose ? { purpose: c.purpose, label: c.name } : {}) });
    // Insertion changes explicit edges; it never silently guesses field mappings.
    const nextNodes = [...nodes.map((n) => targetNode && n.position.x >= targetNode.position.x && !n.parentId ? { ...n, position: { ...n.position, x: n.position.x + 210 } } : n), node];
    const nextEdges = currentEdge ? [...edges.filter((e) => e.id !== currentEdge.id), makeEdge(currentEdge.source, id, { sourceHandle: currentEdge.sourceHandle }), makeEdge(id, currentEdge.target, { targetHandle: currentEdge.targetHandle })] : sourceNode ? [...edges, makeEdge(sourceNode.id, id)] : edges;
    setNodes(nextNodes); setEdges(nextEdges); choose(id, nextNodes); setLibrary(false); changed(); setNotice("节点已添加；请检查输入来源。可撤销添加与接线。");
    window.setTimeout(() => setCenter(pos.x + 80, pos.y + 55, { zoom: Math.min(getZoom(), 1), duration: 220 }), 80);
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
  const switchModel = (id: string) => {
    const definition = getOperator(id); if (!definition || !draft) return;
    const next = makeNode(id, "temp", 0, 0).data;
    const oldInputs = inputFields(draft).map((f) => f.key).join(", ");
    const newInputs = definition.inputs.map((f) => f.key).join(", ") || "自定义输入字段";
    updateDraft((d) => ({ ...d, operatorId: id, config: next.config, mappings: next.mappings }));
    setModelWarning(`已切换到 ${modelNames[id]}。输入 ${oldInputs} → ${newInputs}，请重新核对输入绑定与下游字段。旧模型的配置可通过撤销保存操作恢复。`);
  };
  const launchSetup = () => { if (draftChanged) { setNotice("请先保存当前节点配置，再试跑"); return; } setDock("setup"); setLibrary(false); setExpandedDock(true); setThreeColumns(false); };
  const startRun = () => {
    if (!sampleInput.trim()) { setNotice("请输入至少一条演示输入"); return; }
    if (issues.length) { setDock("validation"); setLibrary(false); setExpandedDock(true); setNotice("请先处理校验提示，再试跑"); return; }
    timers.current.forEach(window.clearTimeout); timers.current = [];
    const active = nodes.filter((n) => !n.data.readOnly);
    const inputs = sampleInput.split("\n").filter((x) => x.trim());
    const snapshot: Run = { phase: "running", revision, count: inputs.length, inputs, startedAt: new Date().toLocaleTimeString("zh-CN", { hour12: false }), nodes: clone(nodes), edges: clone(edges) };
    setRunSampleIndex(0); setRun(snapshot); setDock("run"); setExpandedDock(false); setDiagnosis(false);
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, runState: "queued" } })));
    const failureNode = failureDemo ? active.find((n) => n.data.purpose)?.id ?? active[1]?.id : undefined;
    const failureIndex = active.findIndex((n) => n.id === failureNode);
    const executing = failureNode ? active.slice(0, failureIndex + 1) : active;
    executing.forEach((n, i) => {
      timers.current.push(window.setTimeout(() => setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, runState: "running" } } : x)), 220 + i * 650));
      timers.current.push(window.setTimeout(() => setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, runState: "succeeded" } } : x)), 800 + i * 650));
    });
    timers.current.push(window.setTimeout(() => {
      const unexecutedIds = failureNode ? active.slice(failureIndex + 1).map((n) => n.id) : [];
      setRun({ ...snapshot, unexecutedIds, phase: failureDemo ? "failed" : "passed", failureNode, failureReason: failureDemo ? "演示 AI 返回与已配置输出结构不匹配；请检查必填字段和字段类型。" : undefined });
      if (failureNode) setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, runState: n.id === failureNode ? "failed" : unexecutedIds.includes(n.id) ? "idle" : "succeeded" } })));
      setNotice(failureDemo ? "试跑演示失败，点击底部查看问题" : "试跑演示已跑通，点击底部查看产出");
    }, executing.length * 650 + 1000));
  };
  const keyedNodes = nodes.map((n) => ({ ...n, selected: n.id === selectedId, data: { ...n.data, sourcePreview: n.id === previewSource, issue: issues.find((i) => i.nodeId === n.id)?.message, onAdd: (id: string) => openLibrary({ source: id }), onExpand: expandFlow } }));
  const keyedEdges = edges.map((e) => {
    const target = nodes.find((node) => node.id === e.target);
    const mappingFields = target ? Object.entries(target.data.mappings).filter(([, binding]) => binding.sourceType === "upstream" && binding.sourceNodeId === e.source).map(([key, binding]) => ({ key, label: `${nodes.find((node) => node.id === binding.sourceNodeId)?.data.label ?? "来源已失效"} · 输出字段 ${binding.sourceField} → 输入 ${key}` })) : [];
    return { ...e, className: previewSource && e.source === previewSource && e.target === selectedId ? "p2-source-edge" : "", data: { ...e.data, mappingFields, onMap: (field: string) => focusNode(e.target, field), onInsert: target?.data.readOnly ? undefined : (id: string) => openLibrary({ edge: id }) } };
  });

  const renderConfigField = (f: { key: string; type: string; required?: boolean; constraints?: string }) => {
    const value = draft?.config[f.key] ?? "";
    const selections = f.constraints?.match(/selections:([^;]+)/)?.[1]?.split(",") ?? [];
    const boolean = f.type === "Boolean";
    return <div className="p2-config-block" key={f.key}><label htmlFor={`p2-field-${f.key}`}>{f.key}{f.required && <em>*</em>}</label>{boolean ? <Switch label={f.key} value={Boolean(value)} onChange={(v) => config(f.key, v)} /> : selections.length ? <select id={`p2-field-${f.key}`} value={String(value)} onChange={(e) => config(f.key, e.target.value)}><option value="">请选择</option>{selections.map((s) => <option key={s}>{s}</option>)}</select> : /提示词|表达式/.test(f.key) ? <Textarea id={`p2-field-${f.key}`} value={String(value)} onChange={(e) => config(f.key, e.target.value)} rows={3} /> : <Input id={`p2-field-${f.key}`} type={["Int", "Float", "Number"].includes(f.type) ? "number" : "text"} value={String(value)} onChange={(e) => config(f.key, e.target.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)} />}</div>;
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
    const referenceCount = (field: OutputShapeField) => nodes.reduce((count, node) => count + (node.id === selectedId ? 0 : Object.values(node.data.mappings).filter((binding) => binding.sourceType === "upstream" && binding.sourceNodeId === selectedId && binding.sourceField === `${baseOutput?.key}.${field.key}`).length + (Array.isArray(node.data.config["交付字段"]) ? node.data.config["交付字段"].filter((value) => value === `${selectedId}|${baseOutput?.key}.${field.key}`).length : 0)), 0);
    const example = Object.fromEntries(aiShape.map((field) => [field.key, field.type === "Boolean" ? true : ["Int", "Float"].includes(field.type) ? 1 : field.choices?.[0] ?? field.description ?? "示例文本"]));
    return <aside className={`p2-inspector ${wide ? "wide" : ""}`} aria-label="节点配置抽屉">
    <header><button aria-label="关闭节点配置" onClick={() => { if (wide) setThreeColumns(false); else requestChoose(null); }}><X size={20} /></button><div><strong>{draft?.label}</strong>{draft?.purpose && <small>{draft.operatorId}</small>}</div><button className="p2-expand-button" aria-label="展开输入配置输出对照" title="展开输入／配置／输出" onClick={() => { setThreeColumns(true); setInspectorTab("config"); setLibrary(false); setExpandedDock(false); }}><Maximize2 size={16} /></button></header>
    {run && <div className="p2-inspector-tabs"><button className={inspectorTab === "config" ? "active" : ""} onClick={() => setInspectorTab("config")}>配置</button><button className={inspectorTab === "result" ? "active" : ""} onClick={() => setInspectorTab("result")}>本次试跑</button></div>}
    <div className="p2-inspector-scroll">
      {draft?.readOnly && <div className="p2-callout">Flow 内部步骤只读 · 配置来自引用版本</div>}
      {inspectorTab === "result" && run ? <><div className="p2-callout">演示结果 · 样例 {runSampleIndex + 1} · {run.startedAt} · 草稿快照 {run.revision}{stale && <strong>当前草稿已修改</strong>}</div><h3>节点输入</h3><pre>{JSON.stringify(Object.fromEntries(inputFields(currentRunNode?.data ?? draft!).map((f) => [f.key, f.key === "vid" ? run.inputs[runSampleIndex] : "tos://demo/video.mp4"])), null, 2)}</pre><h3>节点输出</h3><pre>{run.phase === "running" ? "尚在运行" : run.failureNode === selectedId ? "此节点失败，没有产出" : run.unexecutedIds?.includes(selectedId!) ? "上游失败，本节点未执行" : !currentRunNode ? "该节点不在本次试跑快照中" : JSON.stringify(Object.fromEntries(outputFields(currentRunNode.data).map((f) => [f.key, /output/.test(f.key) ? { title: "演示视频", keywords: ["运动", "户外"], summary: "示例产出，仅用于界面演示" } : "demo_value"])), null, 2)}</pre><Button variant="outline" onClick={() => setDiagnosis(true)}>分析问题</Button></> : <>
        {missing.length > 0 && !draft?.readOnly && <button className="p2-incomplete" onClick={() => focusNode(selectedId!, missing[0].field)}><AlertCircle size={15} /><span>{missing.length} 项待检查 · 点击定位</span><ChevronRight size={14} /></button>}
        {draft?.purpose && <div className="p2-config-block"><label htmlFor="p2-model">AI 模型</label><select id="p2-model" value={draft.operatorId} onChange={(e) => switchModel(e.target.value)}>{(draft.purpose === "understanding" ? understandingIds : ["ai-platform.seedream.img2img"]).map((id) => <option value={id} key={id}>{modelNames[id]} 系列</option>)}</select><small>选择用于本节点的模型</small></div>}
        {modelWarning && <div className="p2-callout warning">{modelWarning}</div>}
        {draft?.flowId && <div className="p2-flow-details"><h3>整组工作流 <span className="p2-tag">{draft.source === "custom" ? "用户工作流" : "研发发布"}</span></h3><p>{getFlow(draft)?.description}</p><code>{draft.flowId} · {draft.flowVersion}</code>{getFlow(draft)?.nodes.map((s, i) => <div key={s.key}><span>{i + 1}</span><strong>{getOperator(s.operatorId)?.name ?? s.operatorId}</strong><code>{s.operatorId}</code></div>)}<Button variant="outline" onClick={() => expandFlow(selectedId!)}>{draft.expanded ? "收起" : "展开"}组内步骤</Button></div>}
        <section><h3>输入字段</h3><p className="p2-field-help">输入名由节点固定，选择已有字段作为它的数据来源。</p><div className="p2-field-tags">{inputFields(draft!).length ? inputFields(draft!).map((f) => <span key={f.key}>{f.key}</span>) : <small>无固定输入字段</small>}</div>
          {inputFields(draft!).length > 0 && <><div className="p2-section-label">输入来源 <small>可搜索全部可达上游</small></div>{inputFields(draft!).map((f) => {
            const m = draft?.mappings[f.key];
            const value = m?.sourceType === "upstream" ? `${m.sourceNodeId}|${m.sourceField}` : m?.sourceType === "fixed" ? "fixed" : "";
            const available = sourceNodes.flatMap((n) => availableOutputFields(n.id, displayNodes, edges).map((o) => ({ node: n, field: o, value: `${n.id}|${o.key}` })));
            const valid = available.some((a) => a.value === value);
            const sourceName = sourceNodes.find((node) => node.id === m?.sourceNodeId)?.data.label;
            return <div className="p2-binding" key={f.key}><label htmlFor={`p2-field-${f.key}`}>{f.key}{f.required && <em>*</em>}<small>{f.type}{f.cardinality === "many" ? "[]" : ""}</small></label>{m?.sourceType === "upstream" && <div className={`p2-binding-current ${valid ? "" : "invalid"}`}><strong>{sourceName ?? "来源已失效"}</strong><span>输出 <code>{m.sourceField}</code></span><ChevronRight size={14} /><span>输入 <code>{f.key}</code></span></div>}<SourcePicker id={`p2-field-${f.key}`} value={value} disabled={draft.readOnly} options={available.map((a) => ({ value: a.value, nodeId: a.node.id, nodeLabel: a.node.data.label, field: a.field.key, type: a.field.type, compatible: fieldsCompatible(a.field, f) }))} onChange={(value) => map(f.key, value)} onPreview={setPreviewSource} />{m?.sourceType === "fixed" && <Input aria-label={`${f.key} 固定值`} placeholder="请输入固定值" value={m.value ?? ""} onChange={(e) => updateDraft((d) => ({ ...d, mappings: { ...d.mappings, [f.key]: { sourceType: "fixed", value: e.target.value } } }))} />}{missing.find((i) => i.field === f.key) && <small className="p2-error">{missing.find((i) => i.field === f.key)?.message}</small>}</div>;
          })}</>}
        </section>
        {draft.operatorId === "control.result" ? <section><h3>流程交付字段</h3><p className="p2-field-help">取消选择只会从流程最终结果中移除字段，不会删除节点产出；之后可重新勾选。</p><div className="p2-delivery-list">{deliveryFields.map(({ node, field, value }) => <label key={value}><input type="checkbox" checked={configuredDelivery.includes(value)} onChange={(event) => setDelivery(value, event.target.checked)} /><span><strong>{node.data.label}<span className="p2-source-divider">输出</span><code>{field.key}</code></strong><small>{field.type}</small></span></label>)}{configuredDelivery.filter((value) => !deliveryFields.some((option) => option.value === value)).map((value) => <label className="invalid" key={value}><input type="checkbox" checked onChange={() => setDelivery(value, false)} /><span><strong>来源已失效 · {value.split("|").slice(1).join("|")}</strong><small>移除失效交付引用</small></span></label>)}{deliveryFields.length === 0 && <small>上游还没有可交付字段。</small>}</div></section> : draft.purpose === "understanding" ? null : <section><h3>输出字段</h3><div className="p2-field-tags output">{outputFields(draft).length ? outputFields(draft).map((field) => <span key={field.key}>{field.key}</span>) : <small>按实际配置产生输出</small>}</div></section>}
        {!draft?.flowId && !draft?.readOnly && <>
          {op?.config.filter((f) => !/超时|阶段QPS|阶段并发|自动重命名|跳过/.test(f.key)).map(renderConfigField)}
          {draft.purpose === "understanding" && <section className="p2-output-shape" id="p2-field-AI输出结构"><div className="p2-shape-heading"><h3>AI 输出列</h3><button onClick={() => { setSchemaText(""); setSchemaError(""); setImportPreview(null); setSchemaImport(true); }}>导入已有 Schema</button></div><p className="p2-field-help">一列一个字段，直接用于 CSV 和下游节点。修改这里会自动生成平级 JSON Schema，提示词只需描述标注任务。</p>{promptFormatConflict && <div className="p2-callout warning">提示词中可能已有输出格式，请核对是否与下方输出列一致；原提示词会保留。</div>}{outputShapeErrors(aiShape).map((error) => <p className="p2-error" key={error}>{error}</p>)}<div className="p2-shape-table-head"><span>列名</span><span>内容类型</span><span>必填</span></div>{aiShape.map((field, index) => { const references = referenceCount(field); return <div className="p2-column-row" key={index}><div className="p2-column-controls"><Input aria-label={`AI 输出字段 ${index + 1}`} value={field.key} placeholder="如 title" onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, key: event.target.value } : item))} /><select aria-label={`${field.key || "新字段"} 类型`} value={field.type} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, type: event.target.value, choices: undefined } : item))}>{!(field.type in columnTypes) && <option value={field.type}>需调整：{field.type}</option>}{Object.entries(columnTypes).map(([type, label]) => <option value={type} key={type}>{label}</option>)}</select><input aria-label={`${field.key || "新字段"}必填`} type="checkbox" checked={field.required} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, required: event.target.checked } : item))} /><button aria-label={`删除输出字段 ${field.key}`} onClick={() => updateShape(aiShape.filter((_, row) => row !== index))}><X size={14} /></button></div><Input aria-label={`${field.key || "新字段"}说明`} value={field.description} placeholder="这列标注什么？如：视频标题，20 字以内" onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} /><div className="p2-column-foot"><span><GitBranch size={12} />输出列 <code>{field.key || "待命名"}</code> · 下游可引用</span><small>{references ? `${references} 处已引用` : "尚无显式引用"}</small></div>{references > 0 && <small className="p2-shape-impact">删除或改名会使已有引用失效，保存后会提示修复。</small>}{field.type === "String" && <details className="p2-column-rules"><summary>限定可选值{field.choices?.length ? ` · ${field.choices.length} 项` : "（选填）"}</summary><Input aria-label={`${field.key || "新字段"}可选值`} placeholder="如：体育，新闻，生活；留空表示不限" value={field.choices?.join("，") ?? ""} onChange={(event) => updateShape(aiShape.map((item, row) => row === index ? { ...item, choices: event.target.value.split(/[,，]/).filter(Boolean) } : item))} /></details>}</div>; })}<button className="p2-dashed-add" onClick={() => { let key = `field_${aiShape.length + 1}`; while (aiShape.some((field) => field.key === key)) key += "_new"; updateShape([...aiShape, { key, type: "String", required: true, description: "" }]); }}><Plus size={16} />添加输出列</button><details className="p2-schema-preview"><summary>查看生成的 JSON Schema 与输出示例</summary><strong>JSON Schema · 自动生成</strong><pre>{JSON.stringify(generatedSchema, null, 2)}</pre><strong>平级输出示例 · 每个字段对应一列</strong><pre>{JSON.stringify(example, null, 2)}</pre></details></section>}
          {draft?.operatorId === "phase2.ratio" && <><div className="p2-config-block"><label>分支数</label><select value={Number(draft.config["分支数"] ?? 2)} onChange={(e) => config("分支数", Number(e.target.value))}>{[2, 3, 4, 5].map((v) => <option key={v}>{v}</option>)}</select><small>原型示例选择，不代表生产分支数上限</small></div>{Array.from({ length: Number(draft.config["分支数"] ?? 2) }, (_, i) => renderConfigField({ key: `分支${i + 1}比例`, type: "Int" }))}<p>比例合计需为 100%，按实际到达数据分配</p></>}
          {draft?.operatorId === "control.condition" && <section><h3>有序条件分流</h3><p>从上到下首条命中</p>{getConditionRules(draft.config).map((r, i) => <div key={r.id} className="p2-config-block"><label>{i + 1}. {r.label}</label><Textarea aria-label={r.label} value={r.expression} onChange={(e) => updateDraft((d) => ({ ...d, config: { ...d.config, 分流规则: getConditionRules(d.config).map((x) => x.id === r.id ? { ...x, expression: e.target.value } : x) } }))} /></div>)}<div className="p2-callout">Else · 承接未命中条件的数据</div></section>}
          {op?.kind === "handler" && <section className="p2-runtime"><h3>运行参数</h3><p className="p2-field-help">QPS 按算子预设阈值控制，此处无需重复配置。</p>{op.config.filter((f) => /超时|阶段并发/.test(f.key)).map(renderConfigField)}{Object.entries(runtimeDefaults).filter(([key]) => !op.config.some((f) => f.key.startsWith(key))).map(([key, value]) => <div className="p2-config-block" key={key}><label htmlFor={`p2-field-${key}`}>{key}</label><Input id={`p2-field-${key}`} type="number" min={1} value={String(draft.config[key] ?? value)} onChange={(event) => config(key, event.target.value === "" ? "" : Number(event.target.value))} /></div>)}</section>}
          {draft.operatorId !== "control.start" && draft.kind !== "result" && <section><button className="p2-section-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>高级设置 <small>跳过算子 · 自动重命名</small></span>{advanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>{advanced && <><div className="p2-config-block"><label>跳过算子</label><Switch label="跳过算子" value={Boolean(draft.config["跳过"])} onChange={(value) => config("跳过", value)} /><small>启用后跳过本节点；已有下游来源仍需校验。</small></div><div className="p2-config-block"><label>自动重命名</label><Switch label="自动重命名" value={Boolean(draft.config["自动重命名"])} onChange={(value) => config("自动重命名", value)} /></div></>}</section>}
          {["control.aggregate", "phase2.merge"].includes(draft.operatorId) && <section><div className="p2-section-label blue">聚合字段 <small>{aggregateRows.length} 项</small></div>{aggregateRows.map((v, i) => <div key={i} className="p2-form-row"><Input aria-label={`聚合字段${i + 1}`} placeholder="字段名" value={v} onChange={(e) => { setAggregateRows((rows) => rows.map((x, j) => j === i ? e.target.value : x)); setDraftChanged(true); }} /><button aria-label="删除聚合字段" onClick={() => { setAggregateRows((rows) => rows.filter((_, j) => j !== i)); setDraftChanged(true); }}><X size={14} /></button></div>)}<button className="p2-dashed-add" onClick={() => { setAggregateRows([...aggregateRows, ""]); setDraftChanged(true); }}><Plus size={17} />新增聚合字段</button></section>}
        </>}
        {op?.description && <p className="p2-purpose-copy">{op.description}</p>}
      </>}
    </div>
    <footer><span>{draft?.readOnly ? "引用版本 · 只读" : draftChanged ? "配置未保存" : "配置已保存"}</span>{!draft?.readOnly && <Button onClick={saveConfig}>保存配置</Button>}</footer>
    </aside>;
  };

  const toggleDelivery = (end: PhaseNode, value: string, checked: boolean) => {
    if (draftChanged) { setNotice("请先保存右侧配置，再调整交付字段"); return; }
    const values = deliverySelection(end, nodes, edges).filter((item) => item !== value); if (checked) values.push(value);
    capture(); const nextNodes = nodes.map((node) => node.id === end.id ? { ...node, data: { ...node.data, config: { ...node.data.config, "交付字段": values } } } : node);
    setNodes(nextNodes); if (selectedId === end.id) setDraft(clone(nextNodes.find((node) => node.id === end.id)!.data)); changed();
  };

  return <div className="p2-app" data-history-tick={historyTick}>
    <header className="p2-platform-header"><strong>AI 数据服务平台</strong><span className="p2-prototype-tag">二期交互原型 · 演示数据</span><div><span>当前项目</span><User size={17} /><span>admin</span></div></header>
    <nav className="p2-platform-rail" aria-label="平台导航"><User size={19} /><span className="active"><Workflow size={19} /></span><Database size={19} /><Settings2 size={19} /></nav>
    <header className="p2-workflow-header"><div><div><h1>Pipeline 编排 <span>视频内容标注</span></h1><p>草稿 · {saved ? "已保存" : "未保存"} <span>当前内容版本 {revision}</span></p></div></div><div className="p2-header-actions"><Button variant="outline" onClick={() => setNotice("版本管理入口已预留，内容由一期版本管理功能接入")}><History size={16} />版本管理</Button><Button variant="outline" onClick={() => { if (draftChanged) { setNotice("请先保存当前配置再校验"); return; } setDock("validation"); setLibrary(false); setExpandedDock(true); setThreeColumns(false); }}><FileCheck2 size={16} />校验{issues.length > 0 && <span className="p2-count">{issues.length}</span>}</Button><Button variant="outline" onClick={launchSetup}><Play size={16} />试跑</Button><Button variant="outline" onClick={() => { if (draftChanged) { setNotice("请先保存节点配置，再保存草稿"); return; } setSaved(true); setNotice("演示草稿已保存，仅保留于当前页面"); }}><Save size={16} />保存</Button><Button onClick={() => { if (draftChanged || issues.length) { setNotice("请先保存配置并处理校验提示"); setDock("validation"); setLibrary(false); setExpandedDock(true); return; } setPublishOpen(true); }}><CheckCircle2 size={16} />上线</Button></div></header>
    <main className={`p2-workspace ${selectedId && !threeColumns ? "has-inspector" : ""}`}>
      <div className="p2-central">
        <div className="p2-canvas" ref={stage}>
          <ReactFlow nodes={keyedNodes} edges={keyedEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStart={capture} onNodeDragStop={() => { changed(); }} onConnect={onConnect} onNodeClick={(_, n) => requestChoose(n.id)} onPaneClick={() => requestChoose(null)} onEdgeClick={(_, edge) => { if (draftChanged) { setNotice("请先保存当前配置"); return; } setEdges((es) => es.map((e) => ({ ...e, selected: e.id === edge.id }))); setInspectedEdge(edge.id); setMappingOpen(true); }} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.3} maxZoom={1.5} panOnDrag={canvasMode === "pan"} selectionOnDrag={canvasMode === "select"} deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
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
            { title: "复制选中节点", icon: <Copy size={17} />, onClick: duplicate, disabled: !selected || selected.data.readOnly || selected.data.operatorId === "control.start", separator: true },
            { title: "删除选中节点", icon: <Trash2 size={17} />, onClick: removeSelected, disabled: !selected || selected.data.readOnly || selected.data.operatorId === "control.start" },
            { title: "显示完整流程", icon: <Focus size={17} />, onClick: () => fitView({ padding: 0.3, duration: 200 }) },
          ]} />
          {library && <aside className="p2-library" aria-label="添加节点库"><header><div><h2>添加节点</h2><p>{addContext ? addContext.edge ? "插入到当前连线" : `添加到 ${nodes.find((n) => n.id === addContext.source)?.data.label} 后` : "搜索处理能力或已有工作流"}</p></div><button aria-label="收起节点库" onClick={() => setLibrary(false)}><X size={18} /></button></header><div className="p2-library-search"><Search size={18} /><input autoFocus aria-label="搜索算子或Flow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="用途、算子名称、模型或 Flow ID" />{query && <button aria-label="清空搜索" onClick={() => setQuery("")}><X size={13} /></button>}</div><div className="p2-source-tabs"><button className={source === "engineering" ? "active" : ""} onClick={() => setSource("engineering")}>研发发布</button><button className={source === "custom" ? "active" : ""} onClick={() => setSource("custom")}>用户工作流</button><button className={source === "all" ? "active" : ""} onClick={() => setSource("all")}>全部</button></div><div className="p2-filter-row"><select aria-label="节点类型" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="all">全部类型</option><option value="node">单节点</option><option value="flow">Flow 节点组</option></select><select aria-label="领域筛选" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="all">全部领域</option>{Object.entries(domainLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div><div className="p2-library-summary">{query ? `${filtered.length} 个匹配结果` : "常用入口"}<small>{source === "custom" ? "同一方案版本集中查看" : "支持搜到 Flow 内的步骤"}</small></div><div className="p2-library-results">{(query || source === "custom" || domain !== "all" || kind !== "all" ? filtered : filtered.slice(0, 8)).map((candidate) => {
            const versionFlow = customVersion === "V1" ? customFlowV1 : customFlow;
            const c = candidate.source === "custom" ? { ...candidate, flow: versionFlow, description: versionFlow.description } : candidate;
            const match = query && c.flow?.nodes.findIndex((n) => `${n.operatorId} ${getOperator(n.operatorId)?.name}`.toLowerCase().includes(query.toLowerCase()));
            const Icon = c.kind === "flow" ? Workflow : c.purpose ? Bot : Layers;
            return <article key={c.id} className="p2-candidate"><button className="p2-candidate-main" onClick={() => addCandidate(c)}><span className={`p2-candidate-icon ${c.kind === "flow" ? "flow" : ""}`}><Icon size={21} /></span><div><div className="p2-candidate-title"><strong>{c.name}</strong><span className="p2-tag">{c.kind === "flow" ? `Flow · ${c.flow?.nodes.length} 步骤` : "单节点"}</span></div><p>{c.description}</p><code>{c.id}</code>{typeof match === "number" && match >= 0 && <small className="p2-match">命中第 {match + 1}/{c.flow?.nodes.length} 步：{getOperator(c.flow!.nodes[match].operatorId)?.name}</small>}{c.source === "custom" && <small>用户工作流 · {customVersion} · 来源：生成视频预览 V1</small>}</div></button><div className="p2-candidate-foot"><span>{c.kind === "flow" ? c.source === "custom" ? customVersion : c.flow?.version : c.purpose ? "模型在节点内选择" : c.domains.map((d) => domainLabels[d] ?? d).slice(0, 2).join(" · ")}</span><button onClick={() => setCandidateDetail(candidateDetail === c.id ? null : c.id)}>{candidateDetail === c.id ? "收起" : c.kind === "flow" ? "查看步骤" : "查看详情"}<ChevronDown size={12} /></button></div>{candidateDetail === c.id && <div className="p2-candidate-detail">{c.flow ? c.flow.nodes.map((n, i) => <div key={n.key}><span>{i + 1}</span><p>{getOperator(n.operatorId)?.name}<code>{n.operatorId}</code></p></div>) : <p>{getOperator(c.operatorId ?? "")?.avoidWhen ?? c.description}</p>}{c.source === "custom" && <div><label htmlFor="p2-flow-version">引用版本</label><select id="p2-flow-version" value={customVersion} onChange={(e) => setCustomVersion(e.target.value)}><option value="V2">V2 · 480p（最新）</option><option value="V1">V1 · 720p</option></select><p>同一方案集中显示；添加后引用所选版本，保留参数差异。</p></div>}<Button size="sm" variant="outline" onClick={() => addCandidate(c)}>{c.kind === "flow" ? "整组添加" : "添加节点"}</Button></div>}</article>;
          })}{!filtered.length && <div className="p2-empty"><Search size={25} /><strong>没有匹配结果</strong><p>试试用途关键词，或调整来源、类型与领域。</p><Button variant="outline" size="sm" onClick={() => { setSource("all"); setDomain("all"); setKind("all"); }}>扩大搜索范围</Button></div>}</div><footer><Info size={13} />目录使用本地样例；研发／用户归属为演示。</footer></aside>}
          {threeColumns && draft && <div className="p2-three-columns"><header><strong>输入 · 配置 · 输出对照</strong><button onClick={() => setThreeColumns(false)}><ArrowLeft size={15} />返回画布</button></header><div><section><h3>输入</h3><p>{run ? `本次试跑 · 快照 ${run.revision}` : "尚无试跑数据，可查看字段定义"}</p>{inputFields(draft).map((f) => <div className="p2-config-block" key={f.key}><label>{f.key}</label><small>{f.type} · {f.semanticType}</small><code>来源：{draft.mappings[f.key]?.sourceField ?? "未绑定"}</code>{currentRunNode && <pre>{f.key === "vid" ? run?.inputs[runSampleIndex] : "tos://demo/video.mp4"}</pre>}</div>)}</section>{renderInspector(true)}<section><h3>输出</h3><p>{run?.failureNode === selectedId ? "此节点失败，没有产出" : run?.unexecutedIds?.includes(selectedId!) ? "上游失败，本节点未执行" : run?.phase === "passed" && currentRunNode ? "演示输出，不是真实执行结果" : "尚无本节点的完成结果"}</p>{outputFields(draft).map((f) => <div className="p2-config-block" key={f.key}><label>{f.key}</label><small>{f.type}</small>{run?.phase === "passed" && currentRunNode && <pre>{JSON.stringify({ title: "演示视频", keywords: ["运动", "户外"] }, null, 2)}</pre>}</div>)}</section></div></div>}
        </div>
        {dock !== "none" && <section className={`p2-dock ${dock === "validation" ? "validation" : ""} ${expandedDock ? "expanded" : ""} ${library ? "with-library" : ""} ${selectedId && !threeColumns ? "with-inspector" : ""}`} aria-label="校验与试跑结果">
          <header><button onClick={() => { if (!expandedDock) setLibrary(false); setExpandedDock(!expandedDock); }}><span className={`p2-dock-icon ${run?.phase ?? ""}`}>{dock === "validation" ? <FileCheck2 size={16} /> : run?.phase === "running" ? <LoaderCircle className="p2-spin" size={16} /> : run?.phase === "passed" ? <CheckCircle2 size={16} /> : run?.phase === "failed" ? <AlertCircle size={16} /> : <Play size={15} />}</span><strong>{dock === "validation" ? `校验 · ${issues.length ? `${issues.length} 项待检查` : "通过"}` : dock === "setup" ? "试跑输入" : run ? run.phase === "running" ? "试跑中" : run.phase === "passed" ? "试跑已跑通" : "试跑失败" : "少量数据验证能否跑通"}</strong><span>{dock === "validation" ? "检查配置，不执行数据" : run ? `${run.count} 条输入 · ${run.startedAt} · 快照 ${run.revision}${stale ? " · 草稿已修改" : ""}` : "试跑结果留在编排页"}</span></button><div>{run && <button onClick={() => { setDock("run"); setLibrary(false); setExpandedDock(true); }}>查看结果</button>}{expandedDock ? <button aria-label="收起结果" onClick={() => setExpandedDock(false)}><ChevronDown size={17} /></button> : <button aria-label="展开结果" onClick={() => { setLibrary(false); setExpandedDock(true); }}><ChevronUp size={17} /></button>}</div></header>
          {expandedDock && <div className="p2-dock-content">{dock === "validation" ? <ValidationReview nodes={nodes} edges={edges} issues={issues} onFocus={focusNode} onRun={launchSetup} onToggle={toggleDelivery} /> : dock === "setup" ? <div className="p2-run-setup"><div><h3>试跑输入</h3><p>每行一个演示视频 ID，默认一条。真实入口与限额待评审。</p><Textarea aria-label="试跑输入" value={sampleInput} onChange={(e) => setSampleInput(e.target.value)} rows={2} /></div><div><span className="p2-tag">当前草稿快照 {revision}</span><p>试跑开始后继续编辑，本次结果仍依据开始时的方案。</p><div className="p2-demo-checkbox"><input id="p2-failure-demo" type="checkbox" checked={failureDemo} onChange={(e) => setFailureDemo(e.target.checked)} /><label htmlFor="p2-failure-demo">演示 AI 返回不符合已配置结构</label></div><Button onClick={startRun}><Play size={15} />开始试跑演示</Button></div></div> : run ? <><div className="p2-run-result"><div><div className="p2-result-heading"><h3>{run.phase === "passed" ? "已跑通 · 查看产出" : run.phase === "running" ? "正在运行" : "未跑通 · 查看失败位置"}</h3><span className="p2-tag">演示数据</span></div>{run.phase === "failed" ? <div className="p2-run-error"><AlertCircle size={18} /><div><strong>{run.nodes.find((n) => n.id === run.failureNode)?.data.label}</strong><p>{run.failureReason}</p><button onClick={() => { focusNode(run.failureNode!); setInspectorTab("result"); }}>定位节点</button><button onClick={() => setDiagnosis(true)}>分析问题</button></div></div> : run.phase === "running" ? <p><LoaderCircle className="p2-spin" size={16} />按启动时的草稿快照进行演示</p> : run.inputs.map((input, index) => <div className="p2-output-sample" key={`${index}-${input}`}><Video size={25} /><div><strong>样例 {index + 1} · {input}</strong><p>title：户外运动视频</p><p>keywords：运动、户外　summary：视频主要内容的演示说明</p></div><button onClick={() => { setRunSampleIndex(index); const id = run.nodes.find((n) => n.data.purpose)?.id; if (id) { focusNode(id); setInspectorTab("result"); } }}>查看节点结果<ChevronRight size={14} /></button></div>)}</div><div className="p2-run-context"><p>草稿快照 {run.revision} · {run.startedAt}</p>{stale && <div className="p2-callout warning">当前草稿已修改，以上结果来自修改前方案。</div>}<small>运行、样例及诊断均为界面演示，未调用模型。</small><Button variant="outline" disabled={run.phase === "running"} onClick={launchSetup}>用当前草稿再次试跑</Button></div></div></> : null}</div>}
        </section>}
      </div>
      {selectedId && draft && !threeColumns && renderInspector()}
    </main>
    <footer className="p2-status-footer"><span>当前项目 · 用户工作流草稿</span><span>平移：拖动空白处　缩放：滚轮　连线：拖动连接口</span></footer>
    {notice && <div className="p2-toast" role="status"><Info size={16} />{notice}</div>}
    {pendingSelection && <Modal title="当前节点配置尚未保存" onClose={() => setPendingSelection(null)}><p>切换节点前，保留或放弃本次修改。</p><footer><Button variant="outline" onClick={() => setPendingSelection(null)}>继续编辑</Button><Button variant="outline" onClick={() => { choose(pendingSelection.id); setPendingSelection(null); }}>放弃修改</Button><Button onClick={() => { const nextNodes = nodes.map((n) => n.id === selectedId && draft ? { ...n, data: clone(assembledDraft()!) } : n); capture(); setNodes(nextNodes); changed(); choose(pendingSelection.id, nextNodes); setPendingSelection(null); }}>保存并切换</Button></footer></Modal>}
    {mappingOpen && <Modal title="连线与字段来源" onClose={() => setMappingOpen(false)}><p>连线表达处理顺序。输入绑定在目标节点抽屉中配置，可搜索全部可达上游字段。</p><p>字段类型或结构不兼容时，需显式使用字段映射／转换；接线不会自动猜测对应关系。</p><footer><Button variant="outline" onClick={() => { const edge = edges.find((e) => e.id === inspectedEdge); if (edge && !nodes.find((n) => n.id === edge.target)?.data.readOnly) { setMappingOpen(false); focusNode(edge.target); } }}>配置目标节点</Button><Button variant="outline" disabled={Boolean(nodes.find((n) => n.id === edges.find((e) => e.id === inspectedEdge)?.target)?.data.readOnly)} onClick={() => { capture(); setEdges((es) => es.filter((e) => e.id !== inspectedEdge)); changed(); setMappingOpen(false); setNotice("连线已删除，可撤销；请检查输入绑定"); }}>删除连线</Button><Button onClick={() => setMappingOpen(false)}>返回画布</Button></footer></Modal>}
    {diagnosis && <Modal title="分析问题 · 演示诊断" onClose={() => setDiagnosis(false)}><div className="p2-diagnosis"><span className="p2-tag">只读建议 · 未调用真实 Diagnoser</span><h3>检查模型输出与 JSON 解析约定</h3><p>请对照该次试跑的提示词、输入和原始输出，确认模型是否返回可解析的 JSON。此内容是预设演示，不能作为真实诊断结论。</p><button className="p2-location" onClick={() => { const id = run?.failureNode ?? selectedId; if (id) focusNode(id); setDiagnosis(false); }}>定位问题节点<ChevronRight size={15} /></button><details><summary>查看证据与执行依据</summary><pre>{JSON.stringify({ snapshot: run?.revision, node: run?.failureNode ?? selectedId, evidence: "演示解析异常，尚未接入真实日志" }, null, 2)}</pre></details></div><footer><Button variant="outline" onClick={() => setDiagnosis(false)}>返回修改配置</Button></footer></Modal>}
    {schemaImport && <Modal title="导入已有 JSON Schema" onClose={() => setSchemaImport(false)}><p>粘贴项目经理已有的 Schema，先预览再替换当前输出列。嵌套字段会展开为平级列，文本列表会改为逗号分隔的文本；业务提示词由你核对。</p><Textarea aria-label="已有 JSON Schema" rows={7} placeholder={'{"type":"object","properties":{...}}'} value={schemaText} onChange={(event) => { setSchemaText(event.target.value); setImportPreview(null); setSchemaError(""); }} />{schemaError && <p className="p2-error" role="alert">{schemaError}</p>}{importPreview && <div className="p2-import-preview"><strong>将生成 {importPreview.fields.length} 个平级输出列</strong>{importPreview.changes.map((change) => <p key={change}>{change}</p>)}<div className="p2-check-fields">{importPreview.fields.map((field) => <span key={field.key}>{field.key}</span>)}</div><small>导入会替换现有列；删除或改名的已有下游引用将提示失效。</small></div>}<footer><Button variant="outline" onClick={() => setSchemaImport(false)}>取消</Button><Button variant="outline" onClick={() => { try { setImportPreview(importOutputSchema(schemaText)); setSchemaError(""); } catch (error) { setSchemaError(error instanceof Error ? error.message : "Schema 无法解析"); } }}>预览输出列</Button><Button disabled={!importPreview} onClick={() => { if (importPreview) { config("AI输出结构", JSON.stringify(importPreview.fields)); setSchemaImport(false); setNotice("输出列已导入，请核对提示词并保存配置"); } }}>应用输出列</Button></footer></Modal>}
    {publishOpen && <Modal title="上线固定版本 · 交互演示" onClose={() => setPublishOpen(false)}><p>上线将固定当前草稿内容，后续修改继续保留为草稿。</p><div className="p2-callout">当前草稿 {revision} · 基础检查通过<br />此按钮仅演示上线交互，不会发布到任何系统。</div><footer><Button variant="outline" onClick={() => setPublishOpen(false)}>返回编排</Button><Button onClick={() => { setPublishOpen(false); setNotice("上线交互演示完成；未进行真实发布"); }}>确认上线演示</Button></footer></Modal>}
  </div>;
}

export function Phase2Prototype() { return <ReactFlowProvider><PrototypeInner /></ReactFlowProvider>; }
