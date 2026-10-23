import type { OperatorField, WorkflowConfigValue, FieldMapping } from "@/app/lib/workflow";
import type { OutputShapeField } from "./output-schema";

/** Local demonstration records. No model, storage or execution service is called. */
export type TrialSample = {
  id: string; source: "platform" | "local"; name: string; type: string; size?: number;
  previewUrl: string; values: Record<string, unknown>;
};
export const platformTrialSamples = [
  { id: "demo_vid_001", name: "视频演示样本.mov", type: "video/quicktime", path: "test-assets/demo.mov" },
  { id: "demo_image_001", name: "图片演示样本.jpg", type: "image/jpeg", path: "test-assets/pexels-amaurymic-33953580.jpg" },
];
export function createTrialSample(file: { id: string; source: TrialSample["source"]; name: string; type: string; size?: number; previewUrl: string }): TrialSample {
  return { ...file, values: { vid: file.id, tos_path: `tos://demo/${encodeURIComponent(file.id)}/${encodeURIComponent(file.name)}`, urls: [file.previewUrl], path: file.previewUrl } };
}
export type TrialNode = {
  id: string; label: string; operatorId: string; kind: string; readOnly?: boolean;
  inputs: OperatorField[]; outputs: OperatorField[]; config: Record<string, WorkflowConfigValue>;
  mappings: Record<string, FieldMapping>; outputShape?: OutputShapeField[];
  outputRoot?: string;
};
export type NodeTrialRecord = {
  nodeId: string; status: "queued" | "running" | "succeeded" | "failed" | "unexecuted";
  inputs: Record<string, unknown>; outputs?: Record<string, unknown>;
  config: Record<string, WorkflowConfigValue>; error?: string;
};
/** Archive a detached run snapshot; updating the same round never duplicates it. */
export function retainTrial<T extends { id: string }>(history: T[], run: T): T[] {
  return [structuredClone(run), ...history.filter((item) => item.id !== run.id)];
}
export function trialResultNodes<T extends { id: string; operatorId: string; kind: string; readOnly?: boolean }>(nodes: T[], order: readonly string[] = nodes.map((node) => node.id)): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return nodes.filter((node) => !node.readOnly && node.operatorId !== "control.start" && node.kind !== "result")
    .sort((a, b) => (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length));
}
export function trialValueAt(value: unknown, path: string): unknown {
  if (value && typeof value === "object" && Object.hasOwn(value, path)) return (value as Record<string, unknown>)[path];
  return path.split(".").reduce<unknown>((current, key) => current && typeof current === "object" && Object.hasOwn(current, key) ? (current as Record<string, unknown>)[key] : undefined, value);
}
function demoColumn(field: OutputShapeField, sample: TrialSample): unknown {
  if (field.type === "Boolean") return true;
  if (field.type === "Int") return 1;
  if (field.type === "Float") return 0.95;
  return field.choices?.[0] ?? `${sample.name} · ${field.description || field.key}（演示）`;
}
function resolveConfig(config: TrialNode["config"], records: Record<string, NodeTrialRecord>): TrialNode["config"] {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, typeof value !== "string" ? value : value.replace(/\{([A-Za-z0-9_-]+)\.(inputs|outputs)\.([^{}\n]+)\}/g, (token, id: string, direction: "inputs" | "outputs", path: string) => {
    const resolved = trialValueAt(records[id]?.[direction], path);
    if (resolved === undefined) throw new Error(`${token} 尚无本轮数据`);
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  })]));
}

/** Runs only the supplied demo operators, in dependency order. Missing data is never a success. */
export function simulateTrial(nodes: TrialNode[], edges: { source: string; target: string }[], sample: TrialSample, failureNode?: string) {
  const records: Record<string, NodeTrialRecord> = {};
  const order: string[] = [];
  const pending = nodes.filter((node) => !node.readOnly);
  while (pending.length) {
    const index = pending.findIndex((node) => edges.filter((edge) => edge.target === node.id).every((edge) => Boolean(records[edge.source])));
    if (index < 0) {
      for (const node of pending) {
        records[node.id] = { nodeId: node.id, status: "unexecuted", inputs: {}, config: structuredClone(node.config), error: "依赖关系未就绪，本节点未执行" };
        order.push(node.id);
      }
      break;
    }
    const node = pending.splice(index, 1)[0];
    order.push(node.id);
    const record: NodeTrialRecord = { nodeId: node.id, status: "queued", inputs: {}, config: structuredClone(node.config) };
    records[node.id] = record;
    const incoming = edges.filter((edge) => edge.target === node.id);
    if (incoming.some((edge) => records[edge.source]?.status !== "succeeded")) {
      record.status = "unexecuted"; record.error = "上游未成功，本节点未执行"; continue;
    }
    try {
      if (node.operatorId === "control.start") {
        record.outputs = Object.fromEntries(node.outputs.map((field) => {
          const value = sample.values[field.key];
          if (value === undefined) throw new Error(`所选资源未提供工作流输入 ${field.key}`);
          return [field.key, value];
        }));
      } else if (node.kind === "result") {
        record.outputs = {};
      } else {
        for (const field of node.inputs) {
          const binding = node.mappings[field.key];
          const value = binding?.sourceType === "upstream" ? trialValueAt(records[binding.sourceNodeId!]?.outputs, binding.sourceField!)
            : binding?.sourceType === "fixed" ? binding.value : binding?.sourceType === "parameter" ? sample.values[field.key] : undefined;
          if (value === undefined && field.required && !field.system) throw new Error(`输入 ${field.key} 尚无本轮数据，请核对资源与映射`);
          if (value !== undefined) record.inputs[field.key] = value;
        }
        record.config = resolveConfig(node.config, records);
        if (node.id === failureNode) throw new Error("本轮演示返回不符合配置的输出结构");
        if (node.config["跳过"]) throw new Error("本地演示暂不支持跳过算子，请关闭跳过设置后重试");
        if (node.operatorId === "vod.upload.tos") {
          if (!sample.type.startsWith("video/")) throw new Error("视频转存需要视频资源，请更换所选文件");
          if (typeof record.inputs.vid !== "string") throw new Error("视频转存缺少本轮 vid");
          record.outputs = { tos_path: `tos://demo/${encodeURIComponent(record.inputs.vid)}/${encodeURIComponent(sample.name)}` };
        } else if (["ai-platform.gemini", "ai-platform.deepseek", "ai-platform.qwen_tmp1"].includes(node.operatorId)) {
          if (!node.outputShape?.length) throw new Error("尚未配置 AI 输出列");
          const columns = Object.fromEntries(node.outputShape.map((field) => [field.key, demoColumn(field, sample)]));
          const root = node.outputRoot ?? node.outputs.find((field) => !field.key.includes(".") && !node.outputShape!.some((column) => column.key === field.key))?.key;
          record.outputs = root ? { [root]: columns } : columns;
        } else {
          throw new Error("此算子尚未提供本地演示数据，未生成输出");
        }
      }
      record.status = "succeeded";
    } catch (error) {
      record.status = "failed"; record.error = error instanceof Error ? error.message : "本轮演示失败"; delete record.outputs;
    }
  }
  return { records: structuredClone(records), order };
}
