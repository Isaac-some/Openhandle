import type { Edge, Node } from "@xyflow/react";
import rawOperators from "../data/operators.json";

export type FieldCardinality = "one" | "many" | string;

export interface OperatorField {
  key: string;
  type: string;
  required?: boolean;
  semanticType: string;
  cardinality: FieldCardinality;
  producers?: string[];
  system?: boolean;
}

export interface ConfigField {
  key: string;
  type: string;
  required?: boolean;
  defaultValue?: string;
  constraints?: string;
}

export interface ConditionRule {
  id: string;
  label: string;
  expression: string;
}

export type WorkflowConfigValue = string | number | boolean | ConditionRule[] | string[];

export interface OperatorDefinition {
  id: string;
  name: string;
  description: string;
  avoidWhen?: string;
  domains: string[];
  capabilities: string[];
  behavior: string;
  cardinality: string;
  executionPattern: string;
  inputs: OperatorField[];
  config: ConfigField[];
  outputs: OperatorField[];
  risks: string[];
  verifiedAt?: string;
  confidence?: string;
  kind: "handler" | "flow" | "control" | "result";
  publishedVersion?: string;
  internalOperators?: string[];
}

export type OperatorCategory = "enrich" | "filter" | "transform" | "io";

export const operatorCategoryLabels: Record<OperatorCategory, string> = {
  enrich: "Enrich / 补充字段",
  filter: "Filter / 校验过滤",
  transform: "Transform / 数据转换",
  io: "IO / 读写交付",
};

export interface FlowNodeDefinition {
  key: string;
  operatorId: string;
  position: { x: number; y: number };
  config?: Record<string, string | number | boolean>;
}

export interface FlowEdgeDefinition {
  source: string;
  target: string;
  sourceField?: string;
  targetField?: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  domains: string[];
  version: string;
  nodes: FlowNodeDefinition[];
  edges: FlowEdgeDefinition[];
}

export interface FieldMapping {
  sourceType: "upstream" | "parameter" | "fixed" | "system";
  sourceNodeId?: string;
  sourceField?: string;
  value?: string;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  operatorId: string;
  label: string;
  kind: OperatorDefinition["kind"] | "flow";
  mappings: Record<string, FieldMapping>;
  config: Record<string, WorkflowConfigValue>;
  validationCount: number;
  runState?: "idle" | "queued" | "running" | "pending" | "succeeded" | "failed";
  runDetail?: string;
  flowId?: string;
  flowVersion?: string;
  flowLocked?: boolean;
  connectedRouteIds?: string[];
  incomingCount?: number;
  quickAddOperatorIds?: string[];
  onQuickAdd?: (sourceNodeId: string, operatorId: string) => void;
  onUnlockFlow?: (flowNodeId: string) => void;
}

export type BuilderNode = Node<WorkflowNodeData, "workflow" | "flowGroup">;
export type EdgeRelationOperatorId = "control.condition" | "control.split" | "control.transform";
export interface WorkflowEdgeData extends Record<string, unknown> {
  fields?: string[];
  invalid?: boolean;
  mismatch?: boolean;
  mismatchReason?: string;
  sourceField?: string;
  targetField?: string;
  relationOperatorId?: EdgeRelationOperatorId;
  routeId?: string;
  routeLabel?: string;
}

export type BuilderEdge = Edge<WorkflowEdgeData>;

export interface ValidationIssue {
  id: string;
  level: "error" | "warning";
  title: string;
  detail: string;
  nodeId?: string;
  edgeId?: string;
  fieldKey?: string;
}

const controlOperators: OperatorDefinition[] = [
  {
    id: "control.start",
    name: "启动",
    description: "定义工作流的唯一入口，从这里进入第一条处理线路。",
    domains: ["control"], capabilities: ["start", "entry"], behavior: "source", cardinality: "1:N", executionPattern: "inline",
    inputs: [], config: [], outputs: [], risks: ["一个工作流只能有一个启动节点，且启动节点不能连接前序节点。"], kind: "control",
  },
  {
    id: "control.condition",
    name: "条件分流",
    description: "按从上到下的规则首个命中进入互斥路径，支持 1–10 条具名规则并强制保留 Else 兜底。",
    domains: ["control"], capabilities: ["branch"], behavior: "route", cardinality: "1:1", executionPattern: "inline",
    inputs: [{ key: "resource", type: "Any", required: true, semanticType: "resource.any", cardinality: "one" }],
    config: [], outputs: [],
    risks: ["规则按顺序首个命中；最后一条为不可删除的 Else 兜底，确保每条数据都有唯一去向。"], kind: "control",
  },
  {
    id: "control.filter",
    name: "表达式筛选",
    description: "用一个表达式把数据明确分为保留与筛除两路，筛除数据也必须连接到结束节点。",
    domains: ["control"], capabilities: ["filter", "branch"], behavior: "route", cardinality: "1:1", executionPattern: "inline",
    inputs: [{ key: "resource", type: "Any", required: true, semanticType: "resource.any", cardinality: "one" }],
    config: [{ key: "筛选表达式", type: "String", required: true, defaultValue: "score >= 0.8" }],
    outputs: [],
    risks: ["保留与筛除两个出口都必须连接；筛除不是静默丢弃。"], kind: "control",
  },
  {
    id: "control.split",
    name: "二路平均分片",
    description: "对实际到达的资源按 Batch 顺序精确分为 A/B，奇数多出一条归 A。",
    domains: ["control"], capabilities: ["split"], behavior: "split", cardinality: "1:1", executionPattern: "inline",
    inputs: [{ key: "resources", type: "List", required: true, semanticType: "collection.resource", cardinality: "many" }],
    config: [{ key: "奇数归 A", type: "Boolean", required: true, defaultValue: "true" }],
    outputs: [
      { key: "A", type: "List", semanticType: "collection.resource", cardinality: "many" },
      { key: "B", type: "List", semanticType: "collection.resource", cardinality: "many" },
    ],
    risks: ["同一 Batch 的重试必须沿用原分组。"], kind: "control",
  },
  {
    id: "control.aggregate",
    name: "二路聚合",
    description: "将两条字段结构完全一致的线路合并为一条，字段数量、名称、类型和结构必须逐项相同。",
    domains: ["control"], capabilities: ["aggregate", "merge"], behavior: "aggregate", cardinality: "2:1", executionPattern: "inline",
    inputs: [],
    config: [],
    outputs: [],
    risks: ["只接收两条线路；任一线路新增字段后，另一条线路也必须产出完全相同的字段。"], kind: "control",
  },
  {
    id: "control.wait",
    name: "等待外部结果",
    description: "单资源进入 Pending，合法回传后沿原路径恢复，其他资源继续。",
    domains: ["control"], capabilities: ["pending", "callback"], behavior: "wait", cardinality: "1:1", executionPattern: "external_callback",
    inputs: [{ key: "resource_id", type: "String", required: true, semanticType: "system.resource_id", cardinality: "one", system: true }],
    config: [
      { key: "超时时长(小时)", type: "Int", required: true, defaultValue: "24" },
      { key: "回传任务类型", type: "String", required: true, defaultValue: "human_review" },
    ],
    outputs: [{ key: "callback_result", type: "Object", semanticType: "field.callback_result", cardinality: "one" }],
    risks: ["系统身份键不可被覆盖；超时只提醒，不记为 Handler 失败。"], kind: "control",
  },
  {
    id: "control.transform",
    name: "字段映射",
    description: "显式完成字段对应、JSON 提取、类型或结构变化，转换不在连线中暗中发生。",
    domains: ["control"], capabilities: ["mapping", "transform"], behavior: "transform", cardinality: "1:1", executionPattern: "inline",
    inputs: [{ key: "input", type: "Any", required: true, semanticType: "field.generic", cardinality: "one" }],
    config: [
      { key: "表达式", type: "String", required: true, defaultValue: "$.value" },
      { key: "输出字段名", type: "String", required: true, defaultValue: "transformed_value" },
      { key: "输出类型", type: "String", required: true, defaultValue: "String", constraints: "type:select;selections:String,Int,Float,Boolean,Object,List" },
    ],
    outputs: [{ key: "transformed_value", type: "Any", semanticType: "field.generic", cardinality: "one" }],
    risks: ["类型或结构不兼容时必须使用该节点。"], kind: "control",
  },
  {
    id: "control.result",
    name: "结束",
    description: "记录一条或多条线路的最终结局；可标记为输出结果或筛除，不会继续合并和处理数据。",
    domains: ["control"], capabilities: ["result", "terminal"], behavior: "sink", cardinality: "N:0", executionPattern: "inline",
    inputs: [],
    config: [
      { key: "结局类型", type: "String", required: true, defaultValue: "输出结果", constraints: "type:select;selections:输出结果,筛除" },
      { key: "结局名称", type: "String", required: true, defaultValue: "pipeline_result" },
    ],
    outputs: [], risks: ["结束节点可以接收多条线路，但不会把这些线路聚合后继续输出。"], kind: "result",
  },
];

const handlerOperators = (rawOperators as Omit<OperatorDefinition, "kind">[]).map((operator) => ({
  ...operator,
  kind: "handler" as const,
}));

const flowDefinitions: FlowDefinition[] = [
  {
    id: "flow.remove-watermark-videos",
    name: "筛除水印视频",
    description: "先用 AI 标注水印、字幕和 Logo，再按标注字段过滤不符合条件的视频。",
    domains: ["video", "ai-labeling", "validation"],
    version: "v1.0.0",
    nodes: [
      { key: "watermark", operatorId: "cnclip.watermark", position: { x: 0, y: 0 } },
      { key: "filter", operatorId: "eval.filter", position: { x: 300, y: 0 }, config: { "比较字段": "logo", "操作符号(> < >= <= =)": "=", "比较值": 0 } },
    ],
    edges: [
      { source: "watermark", target: "filter", sourceField: "logo", targetField: "<比较字段值>" },
    ],
  },
  {
    id: "flow.human-review",
    name: "等待人工回传",
    description: "等待外部人工结果，并把合法回传送到明确的结束节点。",
    domains: ["control", "validation"],
    version: "v1.0.0",
    nodes: [
      { key: "wait", operatorId: "control.wait", position: { x: 0, y: 0 } },
      { key: "result", operatorId: "control.result", position: { x: 300, y: 0 } },
    ],
    edges: [
      { source: "wait", target: "result" },
    ],
  },
  {
    id: "flow.video-metadata-validation",
    name: "视频元数据校验",
    description: "读取视频宽高与时长，再用表达式过滤不符合项目规则的资源。",
    domains: ["video", "metadata", "validation"],
    version: "v1.0.0",
    nodes: [
      { key: "metadata", operatorId: "vod.video.get", position: { x: 0, y: 0 }, config: { "输出字段": "duration,width,height,fps" } },
      { key: "check", operatorId: "expr.check", position: { x: 300, y: 0 }, config: { "表达式": "float(duration) >= 30 && int(width) >= 1920" } },
    ],
    edges: [
      { source: "metadata", target: "check", sourceField: "duration", targetField: "<输入字段值>" },
    ],
  },
  {
    id: "flow.video-preview",
    name: "生成视频预览",
    description: "将 TOS 视频上传 VOD，触发转码并等待完成，最后取得预览地址。",
    domains: ["video", "delivery", "storage"],
    version: "v1.0.0",
    nodes: [
      { key: "upload", operatorId: "vod.upload", position: { x: 0, y: 0 } },
      { key: "start", operatorId: "vod.transcoding.start", position: { x: 300, y: 0 }, config: { "清晰度(选填240p/360p/480p/720p)": "360p" } },
      { key: "wait", operatorId: "vod.transcoding.query.v2", position: { x: 600, y: 0 } },
      { key: "preview", operatorId: "vod.transcoding.get", position: { x: 900, y: 0 }, config: { "清晰度(选填240p/360p/480p/720p)": "360p" } },
    ],
    edges: [
      { source: "upload", target: "start", sourceField: "vid", targetField: "vid" },
      { source: "start", target: "wait", sourceField: "runid", targetField: "runid" },
      { source: "wait", target: "preview", sourceField: "vid", targetField: "vid" },
    ],
  },
];

export const operators: OperatorDefinition[] = [...controlOperators, ...handlerOperators];
export const operatorMap = new Map(operators.map((operator) => [operator.id, operator]));
export const edgeRelationOperatorIds: EdgeRelationOperatorId[] = ["control.transform"];
export const edgeRelations = controlOperators.filter((operator) => edgeRelationOperatorIds.includes(operator.id as EdgeRelationOperatorId));
export const controls = controlOperators.filter((operator) => !edgeRelationOperatorIds.includes(operator.id as EdgeRelationOperatorId));
export const publishedFlows = flowDefinitions;

export interface OperatorRoute {
  id: string;
  label: string;
}

const operatorRoutes: Record<string, OperatorRoute[]> = {
  "control.condition": [
    { id: "if", label: "If" },
    { id: "else-if", label: "Else-if" },
    { id: "else", label: "Else" },
  ],
  "control.split": [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
  ],
  "control.filter": [
    { id: "keep", label: "保留" },
    { id: "discard", label: "筛除" },
  ],
};

const defaultConditionRules: ConditionRule[] = [
  { id: "if", label: "If", expression: "score >= 0.8" },
  { id: "else-if", label: "Else-if", expression: "score >= 0.5" },
];

export function getConditionRules(config: Record<string, WorkflowConfigValue>): ConditionRule[] {
  const configured = config["分流规则"];
  if (Array.isArray(configured)) {
    const rules = configured.filter((rule): rule is ConditionRule => Boolean(rule && typeof rule === "object" && "id" in rule && "label" in rule && "expression" in rule));
    return rules;
  }
  const legacyIf = typeof config["If 条件"] === "string" ? String(config["If 条件"]) : defaultConditionRules[0].expression;
  const legacyElseIf = typeof config["Else-if 条件"] === "string" ? String(config["Else-if 条件"]) : defaultConditionRules[1].expression;
  return [
    { ...defaultConditionRules[0], expression: legacyIf },
    { ...defaultConditionRules[1], expression: legacyElseIf },
  ];
}

export function getOperatorRoutes(operatorId: string, config: Record<string, WorkflowConfigValue> = {}): OperatorRoute[] {
  if (operatorId === "control.condition") {
    return [...getConditionRules(config).map(({ id, label }) => ({ id, label })), { id: "else", label: "Else" }];
  }
  return operatorRoutes[operatorId] || [];
}

export function getOperator(id: string) {
  return operatorMap.get(id);
}

export function getOperatorCategory(operator: OperatorDefinition): OperatorCategory | undefined {
  if (operator.kind !== "handler") return undefined;
  if (operator.behavior === "validate_or_filter") return "filter";
  if (
    operator.domains.some((domain) => ["hbase", "delivery"].includes(domain))
    || operator.id === "tos.list"
    || operator.id.startsWith("object_storage.")
    || ["vod.upload", "vod.upload.tos"].includes(operator.id)
    || operator.capabilities.some((capability) => ["read", "write", "transfer", "upload", "download"].includes(capability))
  ) return "io";
  if (operator.behavior === "enrich") return "enrich";
  if (operator.behavior === "fanout" || operator.behavior === "aggregate") return "transform";
  return "transform";
}

export function createNode(operator: OperatorDefinition, id: string, position: { x: number; y: number }): BuilderNode {
  const config = Object.fromEntries(
    operator.config.map((field) => [field.key, parseDefault(field.type, field.defaultValue)]),
  ) as Record<string, WorkflowConfigValue>;
  if (operator.id === "control.condition") config["分流规则"] = defaultConditionRules.map((rule) => ({ ...rule }));
  const mappings = Object.fromEntries(
    operator.inputs.filter((field) => field.system).map((field) => [field.key, { sourceType: "system" as const, value: field.key }]),
  );
  return {
    id,
    type: "workflow",
    position,
    data: {
      operatorId: operator.id,
      label: operator.name,
      kind: operator.kind,
      config,
      mappings,
      validationCount: 0,
      runState: "idle",
    },
  };
}

export function shiftNodesForConditionGrowth(nodes: BuilderNode[], conditionId: string, heightDelta: number): BuilderNode[] {
  if (heightDelta === 0) return nodes;
  const conditionNode = nodes.find((node) => node.id === conditionId);
  if (!conditionNode) return nodes;
  return nodes.map((node) => {
    if (node.id === conditionId || node.data.kind === "flow") return node;
    const sharesColumn = Math.abs(node.position.x - conditionNode.position.x) < 235;
    return sharesColumn && node.position.y > conditionNode.position.y ? { ...node, position: { ...node.position, y: node.position.y + heightDelta } } : node;
  });
}

export function instantiateFlow(flow: FlowDefinition, instanceId: string, origin: { x: number; y: number }): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  const idByKey = new Map(flow.nodes.map((node) => [node.key, `${instanceId}-${node.key}`]));
  const minX = Math.min(...flow.nodes.map((node) => node.position.x));
  const minY = Math.min(...flow.nodes.map((node) => node.position.y));
  const maxX = Math.max(...flow.nodes.map((node) => node.position.x));
  const maxY = Math.max(...flow.nodes.map((node) => node.position.y));
  const frameWidth = maxX - minX + 280;
  const frameHeight = maxY - minY + 224;
  const frameNode: BuilderNode = {
    id: instanceId,
    type: "flowGroup",
    position: origin,
    style: { width: frameWidth, height: frameHeight },
    dragHandle: ".drag-handle",
    selectable: false,
    connectable: false,
    data: {
      operatorId: flow.id,
      label: flow.name,
      kind: "flow",
      config: {},
      mappings: {},
      validationCount: 0,
      flowId: flow.id,
      flowVersion: flow.version,
      flowLocked: true,
    },
  };
  const nodes = flow.nodes.map((spec) => {
    const operator = getOperator(spec.operatorId);
    if (!operator) throw new Error(`Flow ${flow.id} 引用了不存在的算子 ${spec.operatorId}`);
    const node = createNode(operator, idByKey.get(spec.key)!, {
      x: spec.position.x - minX + 30,
      y: spec.position.y - minY + 62,
    });
    node.parentId = instanceId;
    node.extent = "parent";
    node.draggable = false;
    node.data.flowId = flow.id;
    node.data.flowVersion = flow.version;
    node.data.flowLocked = true;
    node.data.config = { ...node.data.config, ...spec.config };
    return node;
  });
  const nodeByKey = new Map(flow.nodes.map((spec, index) => [spec.key, nodes[index]]));
  const edges = flow.edges.map((spec, index) => {
    const source = nodeByKey.get(spec.source);
    const target = nodeByKey.get(spec.target);
    if (!source || !target) throw new Error(`Flow ${flow.id} 的内部连线引用了不存在的节点`);
    if (spec.sourceField && spec.targetField) {
      target.data.mappings[spec.targetField] = {
        sourceType: "upstream",
        sourceNodeId: source.id,
        sourceField: spec.sourceField,
      };
    }
    return {
      id: `${instanceId}-edge-${index}`,
      source: source.id,
      target: target.id,
      type: "workflow",
      data: {
        fields: spec.sourceField && spec.targetField ? [`${spec.sourceField} → ${spec.targetField}`] : [],
        sourceField: spec.sourceField,
        targetField: spec.targetField,
      },
    } satisfies BuilderEdge;
  });
  return { nodes: [frameNode, ...nodes], edges };
}

export function getRecommendedOperatorIds(sourceNodeId: string, nodes: BuilderNode[], edges: BuilderEdge[], limit = 6) {
  const sourceNode = nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode || sourceNode.data.kind === "flow" || sourceNode.data.kind === "result" || edges.some((edge) => edge.source === sourceNodeId)) return [];
  const sourceOperator = getOperator(sourceNode.data.operatorId);
  if (!sourceOperator) return [];
  const sourceFields = getNodeOutputFields(sourceNodeId, nodes, edges);
  const sourceCategory = getOperatorCategory(sourceOperator);
  const categorySequence: Record<OperatorCategory, OperatorCategory[]> = {
    io: ["transform", "enrich", "filter", "io"],
    transform: ["enrich", "filter", "io", "transform"],
    enrich: ["filter", "transform", "io", "enrich"],
    filter: ["io", "transform", "enrich", "filter"],
  };

  return operators
    .filter((operator) => operator.id !== "control.start" && !edgeRelationOperatorIds.includes(operator.id as EdgeRelationOperatorId))
    .map((operator) => {
      const requiredInputs = operator.inputs.filter((field) => field.required && !field.system);
      const compatibleInputs = requiredInputs.filter((input) => sourceFields.some((output) => fieldsCompatible(output, input)));
      const producerMatch = requiredInputs.some((input) => input.producers?.some((producer) => producer.startsWith(sourceOperator.id) || producer.startsWith(sourceOperator.name)));
      const exactSemanticMatches = requiredInputs.filter((input) => sourceFields.some((output) => output.semanticType === input.semanticType)).length;
      const sharedDomains = operator.domains.filter((domain) => sourceOperator.domains.includes(domain)).length;
      const category = getOperatorCategory(operator);
      const compatibilityRatio = requiredInputs.length === 0 ? 0 : compatibleInputs.length / requiredInputs.length;
      let score = sharedDomains * 24 + compatibilityRatio * 40 + Math.min(exactSemanticMatches, 2) * 35;
      if (producerMatch) score += 120;
      if (requiredInputs.length === 0) score += sourceOperator.id === "control.start" ? 120 : 8;
      else if (compatibleInputs.length === requiredInputs.length) score += 90;
      else if (compatibleInputs.length === 0) score -= 90;
      score -= Math.max(0, requiredInputs.length - 1) * 12;
      if (sourceOperator.id === "control.start" && category === "io") score += 45;
      if (sourceCategory && category) {
        const sequenceIndex = categorySequence[sourceCategory].indexOf(category);
        score += Math.max(0, 28 - sequenceIndex * 7);
      }
      if (operator.id === "control.result") score += sourceOperator.id === "control.start" ? -80 : 18;
      if (operator.id === "control.aggregate") score -= 35;
      return { id: operator.id, name: operator.name, score };
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, limit)
    .map((item) => item.id);
}

function parseDefault(type: string, value = "") {
  if (type === "Boolean") return value === "true";
  if (["Int", "Float", "Number"].includes(type) && value && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

export function createInitialWorkflow(): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  const start = createNode(getOperator("control.start")!, "node-start", { x: -235, y: 235 });
  const list = createNode(getOperator("tos.list")!, "node-list", { x: 20, y: 235 });
  list.data.mappings.dir = { sourceType: "fixed", value: "测试文件/*" };
  list.data.config["允许的文件后缀(例如.mp4),使用,分隔"] = ".jpg,.mp4";

  const metadata = createNode(getOperator("vod.video.get")!, "node-metadata", { x: 275, y: 70 });
  metadata.data.mappings.tos_path = { sourceType: "upstream", sourceNodeId: list.id, sourceField: "tos_path" };
  metadata.data.config["输出字段"] = "duration,width,height,fps";

  const frames = createNode(getOperator("vod.frame.extract")!, "node-frames", { x: 275, y: 350 });
  frames.data.mappings.tos_path = { sourceType: "upstream", sourceNodeId: list.id, sourceField: "tos_path" };
  frames.data.config["阶段并发"] = 8;
  frames.data.config["阶段QPS"] = 12;

  const model = createNode(getOperator("ai-platform.deepseek")!, "node-model", { x: 545, y: 350 });
  model.data.mappings.urls = { sourceType: "upstream", sourceNodeId: frames.id, sourceField: "extract_frame_tos_paths" };
  model.data.config["系统提示词"] = "判断画面质量、内容完整性与是否需要人工复核，输出结构化置信度。";
  model.data.config["类型(text / image / video / audio)"] = "image";

  const metadataResult = createNode(getOperator("control.result")!, "node-metadata-result", { x: 815, y: 70 });
  metadataResult.data.config["结局名称"] = "media_metadata";

  const result = createNode(getOperator("control.result")!, "node-result", { x: 815, y: 350 });
  result.data.config["结局名称"] = "validated_media";

  return {
    nodes: [start, list, metadata, frames, model, metadataResult, result],
    edges: [
      { id: "edge-start-list", source: start.id, target: list.id, type: "workflow", data: {} },
      { id: "edge-list-metadata", source: list.id, target: metadata.id, type: "workflow", data: { fields: ["tos_path → tos_path"], sourceField: "tos_path", targetField: "tos_path" } },
      { id: "edge-list-frames", source: list.id, target: frames.id, type: "workflow", data: { fields: ["tos_path → tos_path"], sourceField: "tos_path", targetField: "tos_path" } },
      { id: "edge-frames-model", source: frames.id, target: model.id, type: "workflow", data: { fields: ["extract_frame_tos_paths → urls"], sourceField: "extract_frame_tos_paths", targetField: "urls", relationOperatorId: "control.transform" } },
      { id: "edge-model-result", source: model.id, target: result.id, type: "workflow", data: {} },
      { id: "edge-metadata-result", source: metadata.id, target: metadataResult.id, type: "workflow", data: {} },
    ],
  };
}

export interface ConfigBounds {
  min?: number;
  max?: number;
  hint?: string;
}

export function getConfigBounds(field: ConfigField): ConfigBounds {
  if (!["Int", "Float", "Number"].includes(field.type)) return {};
  const parsedMin = field.constraints?.match(/(?:^|;)min:([\d.-]+)/)?.[1];
  const parsedMax = field.constraints?.match(/(?:^|;)max:([\d.-]+)/)?.[1];
  let min = parsedMin === undefined ? undefined : Number(parsedMin);
  let max = parsedMax === undefined ? undefined : Number(parsedMax);
  let hint: string | undefined;
  if (/QPS/i.test(field.key)) { min ??= 1; max = Math.min(max ?? 128, 128); hint = "平台保护上限 128"; }
  else if (/并发/.test(field.key)) { min ??= 1; max = Math.min(max ?? 512, 512); hint = `平台保护上限 ${max}`; }
  else if (/超时.*小时|小时.*超时/.test(field.key)) { min ??= 1; max = Math.min(max ?? 168, 168); hint = "最长 7 天"; }
  else if (/超时/.test(field.key)) { min ??= 1; max = Math.min(max ?? 86400, 86400); hint = "最长 24 小时"; }
  else if (/最大帧/.test(field.key)) { min ??= 1; max = Math.min(max ?? 300, 300); hint = "最多 300 帧"; }
  return { min, max, hint };
}

export function validateWorkflow(nodes: BuilderNode[], edges: BuilderEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const workflowNodes = nodes.filter((node) => node.data.kind !== "flow");
  const nodeById = new Map(workflowNodes.map((node) => [node.id, node]));
  const endIds = new Set(workflowNodes.filter((node) => node.data.operatorId === "control.result").map((node) => node.id));
  const adjacency = new Map(workflowNodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
  const reachesResult = (startId: string) => {
    const pending = [startId];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (endIds.has(current)) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(adjacency.get(current) || []));
    }
    return false;
  };

  if (workflowNodes.length < 2) {
    issues.push({ id: "workflow-too-small", level: "error", title: "编排尚未完整", detail: "至少需要一个处理节点和一个结束节点。" });
  }
  if (!workflowNodes.some((node) => node.data.operatorId === "control.result")) {
    issues.push({ id: "missing-result", level: "error", title: "缺少结束节点", detail: "每条正式路径都必须有明确的最终结局。" });
  }
  const startNodes = workflowNodes.filter((node) => node.data.operatorId === "control.start");
  if (startNodes.length === 0) {
    issues.push({ id: "missing-start", level: "error", title: "缺少启动节点", detail: "每个工作流必须有且只有一个启动入口。" });
  } else if (startNodes.length > 1) {
    issues.push({ id: "multiple-starts", level: "error", title: "启动节点只能有一个", detail: `当前存在 ${startNodes.length} 个启动节点，请删除多余入口。`, nodeId: startNodes[1].id });
  }

  for (const node of workflowNodes) {
    const operator = getOperator(node.data.operatorId);
    if (!operator) {
      issues.push({ id: `missing-operator-${node.id}`, level: "error", title: "算子不可用", detail: `节点 ${node.data.label} 引用的算子已不在当前启用列表。`, nodeId: node.id });
      continue;
    }
    for (const input of operator.inputs.filter((field) => field.required)) {
      const mapping = node.data.mappings[input.key];
      if (!mapping || (!mapping.value && !mapping.sourceField)) {
        issues.push({
          id: `missing-input-${node.id}-${input.key}`,
          level: "error",
          title: `必填输入「${input.key}」无来源`,
          detail: `在 ${node.data.label} 的输入面板中选择上游字段、Pipeline 参数、固定值或系统字段。`,
          nodeId: node.id,
          fieldKey: input.key,
        });
        continue;
      }
      if (mapping.sourceType === "upstream") {
        const source = mapping.sourceNodeId ? nodeById.get(mapping.sourceNodeId) : undefined;
        const output = source ? getNodeOutputFields(source.id, nodes, edges).find((field) => field.key === mapping.sourceField) : undefined;
        const connected = edges.some((edge) => edge.source === mapping.sourceNodeId && edge.target === node.id);
        if (!source || !output || !connected) {
          issues.push({
            id: `invalid-mapping-${node.id}-${input.key}`,
            level: "error",
            title: `输入「${input.key}」的上游来源已失效`,
            detail: "请重新连线并选择该连线可提供的字段。",
            nodeId: node.id,
            fieldKey: input.key,
          });
        } else if (!fieldsCompatible(output, input)) {
          const edge = edges.find((item) => item.source === mapping.sourceNodeId && item.target === node.id);
          if (edge?.data?.relationOperatorId) continue;
          issues.push({
            id: `type-mismatch-${node.id}-${input.key}`,
            level: "error",
            title: `字段类型不兼容：${output.key} → ${input.key}`,
            detail: "类型或结构变化必须经过显式的「字段映射」节点。",
            nodeId: node.id,
            edgeId: edge?.id,
            fieldKey: input.key,
          });
        }
      }
    }
    for (const field of operator.config.filter((item) => item.required)) {
      const value = node.data.config[field.key];
      if (value === "" || value === null || value === undefined) {
        issues.push({
          id: `missing-config-${node.id}-${field.key}`,
          level: "error",
          title: `必填配置「${field.key}」为空`,
          detail: `在 ${node.data.label} 的算子配置中填写该值。`,
          nodeId: node.id,
          fieldKey: field.key,
        });
      }
    }
    for (const field of operator.config) {
      const bounds = getConfigBounds(field);
      if (bounds.min === undefined && bounds.max === undefined) continue;
      const value = Number(node.data.config[field.key]);
      if (node.data.config[field.key] === "" || node.data.config[field.key] === undefined) continue;
      if (!Number.isFinite(value) || (bounds.min !== undefined && value < bounds.min) || (bounds.max !== undefined && value > bounds.max)) {
        const range = bounds.min !== undefined && bounds.max !== undefined ? `${bounds.min}–${bounds.max}` : bounds.max !== undefined ? `不超过 ${bounds.max}` : `不少于 ${bounds.min}`;
        issues.push({
          id: `unsafe-config-${node.id}-${field.key}`,
          level: "error",
          title: `配置「${field.key}」超出安全范围`,
          detail: `当前值为 ${String(node.data.config[field.key])}，允许范围为 ${range}。`,
          nodeId: node.id,
          fieldKey: field.key,
        });
      }
    }
    if (node.data.operatorId !== "control.result" && !edges.some((edge) => edge.source === node.id)) {
      issues.push({ id: `dangling-${node.id}`, level: "error", title: `${node.data.label} 没有下游`, detail: "将该节点连接到后续处理或结束节点。", nodeId: node.id });
    }
    if (node.data.operatorId === "control.result" && !edges.some((edge) => edge.target === node.id)) {
      issues.push({ id: `end-without-input-${node.id}`, level: "error", title: "结束节点没有接入线路", detail: "将需要记录的输出结果或筛除路径连接到该节点。", nodeId: node.id });
    }
    if (node.data.operatorId === "control.condition") {
      const rules = getConditionRules(node.data.config);
      if (rules.length < 1 || rules.length > 10) {
        issues.push({ id: `condition-rule-count-${node.id}`, level: "error", title: "条件分流规则数量不合法", detail: "配置 1–10 条具名规则，Else 兜底会始终保留。", nodeId: node.id, fieldKey: "分流规则" });
      }
      const labels = rules.map((rule) => rule.label.trim());
      rules.forEach((rule) => {
        if (!rule.label.trim()) issues.push({ id: `condition-rule-label-${node.id}-${rule.id}`, level: "error", title: "分流名称为空", detail: "每条规则都必须有可在节点和连线上识别的名称。", nodeId: node.id, fieldKey: "分流规则" });
        if (!rule.expression.trim()) issues.push({ id: `condition-rule-expression-${node.id}-${rule.id}`, level: "error", title: `分流「${rule.label || "未命名"}」缺少表达式`, detail: "规则按从上到下首个命中，表达式不能为空。", nodeId: node.id, fieldKey: "分流规则" });
      });
      const duplicateLabel = labels.find((label, index) => label && labels.indexOf(label) !== index);
      if (duplicateLabel) issues.push({ id: `condition-duplicate-label-${node.id}`, level: "error", title: `分流名称「${duplicateLabel}」重复`, detail: "每个具名出口都必须使用唯一名称。", nodeId: node.id, fieldKey: "分流规则" });
    }
    const routes = getOperatorRoutes(node.data.operatorId, node.data.config);
    const routeIds = new Set(routes.map((route) => route.id));
    const staleRouteEdge = routes.length > 0 ? edges.find((edge) => edge.source === node.id && edge.data?.routeId && !routeIds.has(String(edge.data.routeId))) : undefined;
    if (staleRouteEdge) {
      issues.push({ id: `stale-route-${node.id}-${String(staleRouteEdge.data?.routeId)}`, level: "error", title: "连线引用了已删除的分流", detail: "删除该连线，或从当前的具名出口重新连接。", nodeId: node.id, edgeId: staleRouteEdge.id });
    }
    for (const route of routes) {
      const routeEdges = edges.filter((edge) => edge.source === node.id && (edge.sourceHandle === route.id || edge.data?.routeId === route.id));
      if (routeEdges.length === 0) {
        issues.push({
          id: `missing-route-${node.id}-${route.id}`,
          level: "error",
          title: `出口「${route.label}」尚未连接`,
          detail: `${node.data.label} 的每个具名出口都必须连接到一条处理路径。`,
          nodeId: node.id,
        });
      } else if (routeEdges.length > 1) {
        issues.push({
          id: `duplicate-route-${node.id}-${route.id}`,
          level: "error",
          title: `出口「${route.label}」连接了多条路径`,
          detail: "一个具名出口只能连接一条路径；需要再次分流时请增加新的控制节点。",
          nodeId: node.id,
          edgeId: routeEdges[1].id,
        });
      }
      for (const edge of routeEdges) {
        if (!reachesResult(edge.target)) {
          issues.push({
            id: `route-without-result-${node.id}-${route.id}`,
            level: "error",
            title: `出口「${route.label}」无法到达结束节点`,
            detail: "补齐该路径的后续连线和最终结局；合法空分支在运行时可为 0 条，但结构不能悬空。",
            nodeId: node.id,
            edgeId: edge.id,
          });
        }
      }
    }
    if (node.data.operatorId === "control.start" && edges.some((edge) => edge.target === node.id)) {
      issues.push({ id: `start-has-upstream-${node.id}`, level: "error", title: "启动节点不能有前序", detail: "删除指向启动节点的连线。", nodeId: node.id });
    }
    if (node.data.operatorId === "control.aggregate") {
      const incoming = edges.filter((edge) => edge.target === node.id);
      if (incoming.length !== 2) {
        issues.push({
          id: `aggregate-input-count-${node.id}`,
          level: "error",
          title: "聚合节点必须连接两条线路",
          detail: `当前接入 ${incoming.length} 条线路；聚合只接受两条字段完全一致的线路。`,
          nodeId: node.id,
        });
      } else {
        const status = getAggregateCompatibility(incoming.map((edge) => edge.source), nodes, edges);
        if (!status.compatible) {
          issues.push({
            id: `aggregate-schema-${node.id}`,
            level: "error",
            title: "两条线路的字段不一致，不能聚合",
            detail: status.reason,
            nodeId: node.id,
            edgeId: incoming[1].id,
          });
        }
      }
    } else if (node.data.operatorId !== "control.result") {
      const upstreamSources = new Set(edges.filter((edge) => edge.target === node.id).map((edge) => edge.source));
      if (upstreamSources.size > 1) {
        issues.push({
          id: `implicit-merge-${node.id}`,
          level: "error",
          title: "普通节点不能直接汇合两条线路",
          detail: "先将两条字段完全一致的线路连接到聚合节点，再继续后续处理。",
          nodeId: node.id,
        });
      }
    }
  }

  if (hasCycle(nodes, edges)) {
    issues.push({ id: "cycle", level: "error", title: "正式 Pipeline 不允许循环", detail: "删除形成回路的连线后再生成工作流。" });
  }

  if (workflowNodes.length > 12) {
    issues.push({ id: "large-canvas", level: "warning", title: "画布节点较多", detail: "建议使用对齐和小地图检查未连接的路径。" });
  }
  return issues;
}

export function fieldsCompatible(source: OperatorField, target: OperatorField) {
  if (source.semanticType === target.semanticType) return true;
  if (["Any", "Unknown"].includes(source.type) || ["Any", "Unknown"].includes(target.type)) return true;
  if (source.type === target.type) return true;
  return source.semanticType === "field.generic" || target.semanticType === "field.generic";
}

export function getEdgeFieldPair(edge: BuilderEdge) {
  if (edge.data?.sourceField && edge.data?.targetField) {
    return { sourceField: edge.data.sourceField, targetField: edge.data.targetField };
  }
  const label = edge.data?.fields?.[0];
  if (!label) return {};
  const [sourceField, targetField] = label.split("→").map((part) => part.trim());
  return { sourceField, targetField };
}

export function getConnectionStatus(source: OperatorDefinition | undefined, target: OperatorDefinition | undefined, sourceField?: string, targetField?: string) {
  return getConnectionStatusForFields(source?.outputs || [], target, sourceField, targetField);
}

export function getConnectionStatusForFields(sourceFields: OperatorField[], target: OperatorDefinition | undefined, sourceField?: string, targetField?: string) {
  const output = sourceFields.find((field) => field.key === sourceField);
  const input = target?.inputs.find((field) => field.key === targetField);
  if (!output || !input) {
    return { compatible: false, reason: "尚未选择明确的出参和入参。", output, input };
  }
  if (!fieldsCompatible(output, input)) {
    return {
      compatible: false,
      reason: `${output.key}（${output.type}）无法直接连接 ${input.key}（${input.type}）`,
      output,
      input,
    };
  }
  return { compatible: true, reason: "字段类型与结构匹配。", output, input };
}

function mergeFieldSchemas(...schemas: OperatorField[][]) {
  const fields = new Map<string, OperatorField>();
  schemas.flat().forEach((field) => fields.set(field.key, field));
  return Array.from(fields.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function getNodeOutputFields(nodeId: string, nodes: BuilderNode[], edges: BuilderEdge[], cache = new Map<string, OperatorField[]>(), visiting = new Set<string>()): OperatorField[] {
  const cached = cache.get(nodeId);
  if (cached) return cached;
  if (visiting.has(nodeId)) return [];
  visiting.add(nodeId);
  const node = nodes.find((item) => item.id === nodeId);
  const operator = node ? getOperator(node.data.operatorId) : undefined;
  const incomingSchemas = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => getNodeOutputFields(edge.source, nodes, edges, cache, visiting));
  const inherited = operator?.id === "control.aggregate" ? (incomingSchemas[0] || []) : mergeFieldSchemas(...incomingSchemas);
  const routeOnly = operator && node ? getOperatorRoutes(operator.id, node.data.config).length > 0 : false;
  const result = mergeFieldSchemas(inherited, routeOnly ? [] : operator?.outputs || []);
  visiting.delete(nodeId);
  cache.set(nodeId, result);
  return result;
}

function fieldSchemaSignature(field: OperatorField) {
  return `${field.key}\u0000${field.type}\u0000${field.semanticType}\u0000${field.cardinality}`;
}

export function compareFieldSchemas(left: OperatorField[], right: OperatorField[]) {
  const leftSignatures = new Set(left.map(fieldSchemaSignature));
  const rightSignatures = new Set(right.map(fieldSchemaSignature));
  const leftOnly = left.filter((field) => !rightSignatures.has(fieldSchemaSignature(field))).map((field) => field.key);
  const rightOnly = right.filter((field) => !leftSignatures.has(fieldSchemaSignature(field))).map((field) => field.key);
  if (leftOnly.length === 0 && rightOnly.length === 0) {
    return { compatible: true, reason: `两条线路均包含 ${left.length} 个完全一致的字段。` };
  }
  if (left.length !== right.length) {
    return { compatible: false, reason: `两条线路分别产出 ${left.length} 和 ${right.length} 个字段，数量不一致。` };
  }
  const different = Array.from(new Set([...leftOnly, ...rightOnly])).slice(0, 4);
  return { compatible: false, reason: `字段数量相同，但 ${different.join("、")} 的名称、类型或结构不一致。` };
}

export function getDataConservationStatus(inputIds: string[], terminalOutcomes: Record<string, string[]>) {
  const expected = new Set(inputIds);
  const occurrences = new Map<string, number>();
  Object.values(terminalOutcomes).flat().forEach((id) => occurrences.set(id, (occurrences.get(id) || 0) + 1));
  const missingIds = inputIds.filter((id) => !occurrences.has(id));
  const duplicateIds = Array.from(occurrences).filter(([, count]) => count > 1).map(([id]) => id);
  const unexpectedIds = Array.from(occurrences.keys()).filter((id) => !expected.has(id));
  return {
    complete: missingIds.length === 0 && duplicateIds.length === 0 && unexpectedIds.length === 0,
    inputCount: inputIds.length,
    terminalCount: Array.from(occurrences.values()).reduce((total, count) => total + count, 0),
    missingIds,
    duplicateIds,
    unexpectedIds,
  };
}

export function getAggregateCompatibility(sourceNodeIds: string[], nodes: BuilderNode[], edges: BuilderEdge[]) {
  if (sourceNodeIds.length < 2) return { compatible: true, reason: "等待第二条线路。" };
  if (sourceNodeIds.length > 2) return { compatible: false, reason: "聚合节点只允许接入两条线路。" };
  return compareFieldSchemas(
    getNodeOutputFields(sourceNodeIds[0], nodes, edges),
    getNodeOutputFields(sourceNodeIds[1], nodes, edges),
  );
}

export function wouldCreateCycle(nodes: BuilderNode[], edges: BuilderEdge[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return true;
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
  const pending = [targetId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === sourceId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) || []));
  }
  return false;
}

function hasCycle(nodes: BuilderNode[], edges: BuilderEdge[]) {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  edges.forEach((edge) => adjacency.get(edge.source)?.push(edge.target));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some((node) => visit(node.id));
}

export const domainLabels: Record<string, string> = {
  control: "平台控制",
  "ai-labeling": "AI 打标与模型",
  storage: "存储与路径",
  image: "图片处理",
  video: "视频处理",
  audio: "音频处理",
  validation: "质量校验",
  tabular: "表格与聚合",
  hbase: "HBase",
  metadata: "元数据",
  delivery: "交付",
};
