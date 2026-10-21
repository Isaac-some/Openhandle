import { operators, publishedFlows, type FlowDefinition } from "@/app/lib/workflow";
import type { Capability } from "./capability-search";

export const understandingIds = ["ai-platform.gemini", "ai-platform.deepseek", "ai-platform.qwen_tmp1"];
const groupedIds = new Set([...understandingIds, "ai-platform.seedream.img2img", "control.transform"]);
export const customFlow: FlowDefinition = {
  ...publishedFlows.find((flow) => flow.id === "flow.video-preview")!,
  id: "custom_video_preview_demo", name: "项目视频预览", version: "V2",
  description: "基于生成视频预览方案，将转码及预览清晰度设为 480p。",
  nodes: publishedFlows.find((flow) => flow.id === "flow.video-preview")!.nodes.map((node) => ({ ...node, config: { ...node.config, ...(/transcoding.start|get/.test(node.operatorId) ? { "清晰度(选填240p/360p/480p/720p)": "480p" } : {}) } })),
};
export const customFlowV1: FlowDefinition = {
  ...customFlow, version: "V1", description: "项目视频预览早期版本，转码及预览清晰度为 720p。",
  nodes: customFlow.nodes.map((node) => ({ ...node, config: { ...node.config, ...(/transcoding.start|get/.test(node.operatorId) ? { "清晰度(选填240p/360p/480p/720p)": "720p" } : {}) } })),
};
const labelingFlow: FlowDefinition = {
  id: "flow.video-labeling-demo", name: "视频内容标注", version: "V1",
  description: "视频转存后使用 Gemini 输出标题、关键词和摘要。适合作为调整模型或标注要求的起点。",
  domains: ["video", "ai-labeling"],
  nodes: [
    { key: "transfer", operatorId: "vod.upload.tos", position: { x: 0, y: 0 } },
    { key: "label", operatorId: "ai-platform.gemini", position: { x: 300, y: 0 }, config: { "提示词": "描述视频的主要内容，输出标题、关键词和摘要。" } },
  ],
  edges: [{ source: "transfer", target: "label", sourceField: "tos_path", targetField: "tos_path" }],
};
export const flowSource = [...publishedFlows, customFlow, customFlowV1, labelingFlow];
export const candidates: Capability[] = [
  { id: "purpose.understanding", name: "AI 理解与标注", description: "选择 Gemini、DeepSeek 或 Qwen，配置提示词和输入字段。", domains: ["ai-labeling", "video", "image"], kind: "node", source: "engineering", operatorId: "ai-platform.gemini", purpose: "understanding" },
  { id: "purpose.generation", name: "AI 图片生成", description: "选择图片生成模型，配置输入图片与提示词。", domains: ["image", "ai-labeling"], kind: "node", source: "engineering", operatorId: "ai-platform.seedream.img2img", purpose: "generation" },
  ...operators.filter((operator) => !groupedIds.has(operator.id) && !["control.wait", "control.start", "control.split", "control.aggregate"].includes(operator.id)).map((operator) => ({ id: operator.id, name: operator.name, description: operator.description, domains: operator.domains, kind: "node" as const, source: "engineering" as const, operatorId: operator.id })),
  { id: "phase2.ratio", name: "比例分流", description: "按配置比例分配到多条互斥分支。", domains: ["control"], kind: "node", source: "engineering" },
  { id: "phase2.merge", name: "合流", description: "将字段结构一致的多路记录合并到下游。", domains: ["control"], kind: "node", source: "engineering" },
  ...[...publishedFlows, customFlow, labelingFlow].map((flow) => ({ id: flow.id, name: flow.name, description: flow.description, domains: flow.domains, kind: "flow" as const, source: (flow.id.startsWith("custom_") ? "custom" : "engineering") as Capability["source"], flow, versions: flow.id === customFlow.id ? [customFlow, customFlowV1] : [flow] })),
];
