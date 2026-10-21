import { referenceToken, type NodeReference } from "./node-reference";
import type { ConfigurationPlan, DiagnosisNodeSnapshot } from "./diagnosis-repair";

// Local interaction data only. This module does not call a model or an execution service.
export type DiagnosisContext = {
  id: string;
  source: "trial" | "validation" | "draft";
  projectId?: string; workflowId?: string;
  revision: number;
  recordedAt: string;
  phase: "passed" | "failed" | "blocked";
  inputCount: number;
  nodes: DiagnosisNodeSnapshot[];
  issues: { nodeId: string; field?: string; message: string }[];
};

export type DiagnosisFinding = {
  id: string;
  location: { nodeId?: string; nodeLabel: string; field?: string };
  assessment: "confirmed" | "suspected";
  cause: string;
  evidence_refs: string[];
  suggestions: { action: string; verification: string; requires: "user" | "developer" }[];
};

export type DiagnosisResult = {
  schema_version: "1.0";
  diagnosis_id: string;
  context: { record_id: string; source: DiagnosisContext["source"]; revision: number; recorded_at: string };
  status: "completed" | "needs_evidence";
  summary: string;
  findings: DiagnosisFinding[];
  evidence: { id: string; type: string; excerpt: string }[];
  missing_evidence: string[];
  followups: { question: string; answer: string }[];
  node_references?: NodeReference[];
  configuration_plan?: ConfigurationPlan;
  application?: { state: "applied" | "undone"; message: string };
};

export function createDiagnosisResult(context: DiagnosisContext): DiagnosisResult {
  const validation = context.source !== "trial";
  const sourceLabel = context.source === "draft" ? "草稿检查" : validation ? "校验" : "试跑";
  const findings: DiagnosisFinding[] = context.issues.map((issue, index) => ({
    id: `issue-${index + 1}`,
    location: { nodeId: issue.nodeId, nodeLabel: context.nodes.find((node) => node.id === issue.nodeId)?.label ?? "已移除的节点", field: issue.field },
    assessment: "confirmed",
    cause: issue.message,
    evidence_refs: [`issue-${index + 1}`, "snapshot"],
    suggestions: [{
      action: validation ? "定位该项配置，核对连线、字段来源或必填值。" : "对照该次输出列定义与原始返回，检查标出的字段。",
      verification: validation ? "人工修改后重新校验，确认该项阻断消失。" : "人工调整后重新试跑，并核对实际输出；配置方案应用后仍需用户主动试跑验证。",
      requires: "user",
    }],
  }));
  return {
    schema_version: "1.0",
    followups: [],
    diagnosis_id: `${context.id}-analysis-1`,
    context: { record_id: context.id, source: context.source, revision: context.revision, recorded_at: context.recordedAt },
    status: validation && findings.length ? "completed" : "needs_evidence",
    summary: findings.length
      ? `本次${sourceLabel}有 ${findings.length} 处问题，已按位置列出。${validation ? "可逐项定位配置。" : "已记录报错，根因仍需结合执行证据核实。"}`
      : validation ? "当前草稿没有已记录的校验报错。可引用节点或字段描述配置问题；尚无本次执行数据。" : "本次试跑已跑通。若结果不符合预期，可描述期望、实际差异和观察到的位置。",
    findings,
    evidence: [
      { id: "snapshot", type: "configuration", excerpt: `${sourceLabel}记录 ${context.id} · 草稿快照 ${context.revision} · ${context.recordedAt}` },
      ...context.issues.map((issue, index) => ({ id: `issue-${index + 1}`, type: validation ? "validation" : "demo_error", excerpt: issue.message })),
    ],
    missing_evidence: validation ? [] : ["尚未提供执行日志、模型原始返回和实际产物，无法确认运行根因。"],
  };
}

export function addReportedProblems(context: DiagnosisContext, previous: DiagnosisResult, text: string, nodeId: string, field: string): DiagnosisResult {
  if (previous.context.record_id !== context.id) throw new Error("诊断上下文不一致");
  const descriptions = text.split(/[\n；;]+/).map((part) => part.trim()).filter(Boolean);
  if (!descriptions.length) return previous;
  const node = context.nodes.find((item) => item.id === nodeId);
  const findings: DiagnosisFinding[] = descriptions.map((description, index) => ({
    id: `reported-${previous.findings.length + index + 1}`,
    location: { ...(node ? { nodeId: node.id } : {}), nodeLabel: node?.label ?? (context.source !== "trial" ? "本次校验" : "本次运行结果"), ...(field.trim() ? { field: field.trim() } : {}) },
    assessment: "suspected",
    cause: `待核实的用户描述：${description}`,
    evidence_refs: ["snapshot"],
    suggestions: [{
      action: context.source !== "trial" ? "对照该次校验和配置核实描述中的位置；尚未执行，不能据此判断实际输出。" : "补充期望结果与实际差异，对照本次样本、输出文件和相关节点的原始返回。",
      verification: "取得实际证据后确认偏差出现位置；用户描述本身不作为根因已确认的证据。",
      requires: "user",
    }],
  }));
  return {
    ...previous,
    diagnosis_id: `${context.id}-analysis-${previous.findings.length + descriptions.length + 1}`,
    status: "needs_evidence",
    summary: `已补充 ${descriptions.length} 项描述；本次排查共 ${previous.findings.length + descriptions.length} 个问题点。下面保留已有问题，并列出需要核实的位置和下一步。`,
    findings: [...previous.findings, ...findings],
    missing_evidence: Array.from(new Set([...previous.missing_evidence, "新描述尚需对应的预期、实际结果或配置证据，不能直接确认根因。"])),
  };
}

export function addDiagnosisFollowUp(context: DiagnosisContext, previous: DiagnosisResult, question: string): DiagnosisResult {
  if (previous.context.record_id !== context.id) throw new Error("诊断上下文不一致");
  if (!question.trim()) return previous;
  const answer = context.source !== "trial"
    ? `已保留本次校验的 ${previous.findings.length} 个问题点。可查看下方配置方案的修改前后；应用仅作用于当前草稿，随后由你主动试跑验证。`
    : `已沿用本次试跑的 ${previous.findings.length} 个问题点。下一步请提供该次样本的预期与实际差异、相关原始返回或输出文件；当前证据不足以确认根因。`;
  return { ...previous, followups: [...previous.followups, { question: question.trim(), answer }] };
}

export function diagnosisSummary(context: DiagnosisContext, result: DiagnosisResult): string {
  return [
    "Diagnoser · 配置修复记录",
    `${context.source === "trial" ? "试跑" : context.source === "draft" ? "草稿检查" : "校验"}记录：${context.id}｜草稿快照：${context.revision}｜时间：${context.recordedAt}`,
    result.summary,
    ...result.findings.map((finding, index) => `${index + 1}. ${finding.location.nodeLabel}${finding.location.field ? ` / ${finding.location.field}` : ""}｜${finding.assessment === "confirmed" ? "已记录的配置错误" : "待核实描述"}\n${finding.cause}\n建议：${finding.suggestions.map((suggestion) => suggestion.action).join(" ")}`),
    ...(result.node_references?.map((reference) => `节点引用：${reference.label}｜完整引用：${referenceToken(reference)}｜工作流：${reference.workflowId}｜快照：${reference.revision}`) ?? []),
    ...(result.configuration_plan?.changes.map((change) => `配置方案：${change.nodeLabel} / ${change.key}\n修改前：${change.beforeLabel}\n修改后：${change.afterLabel}\n原因：${change.reason}`) ?? []),
    ...(result.application ? [`应用状态：${result.application.state} · ${result.application.message}`] : []),
    ...result.followups.map((turn) => `追问：${turn.question}\n回复：${turn.answer}`),
    `依据：${result.evidence.map((evidence) => evidence.excerpt).join("；")}`,
    `待核实：${result.missing_evidence.join("；") || "实际执行结果尚未产生，本次仅解释配置校验。"}`,
    "用户点击后仅修改已有节点配置，不修改算子源码、不增加节点或流程连线；重跑由用户决定。",
  ].join("\n\n");
}
