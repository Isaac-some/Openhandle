"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { ArrowUp, ChevronRight, Copy, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiAssistantCard } from "@/components/ui/ai-assistant-card";
import { addDiagnosisFollowUp, addReportedProblems, createDiagnosisResult, diagnosisSummary, type DiagnosisContext, type DiagnosisResult } from "./prototype-diagnosis";
import { mergeNodeReferences, nodeReferenceKey, referenceParts, referencePattern, referenceToken, readNodeReferencePaste, resolveNodeReference, type NodeReference } from "./node-reference";
import { NodeReferenceView } from "./node-reference-view";
import { ReferenceTextEditor } from "./reference-text-editor";
import { createConfigurationPlan, type ConfigurationPlan, type RepairOutcome } from "./diagnosis-repair";

type Session = {
  result: DiagnosisResult; messages: { question: string; answer: string; references: NodeReference[] }[]; input: string;
  feedbackEligible: boolean; feedback?: "已确认定位" | "仍未定位";
};
const sourceName = (context: DiagnosisContext) => context.source === "trial" ? "试跑" : context.source === "draft" ? "当前草稿" : "配置校验";

export function DiagnosisPanel({ context, records, visible, draftRevision, references, liveNodeIds, onAddReferences, onSelectRecord, onRemoveReference, onMinimize, onViewErrors, onFocus, onNotice, onApply, onUndo }: {
  context: DiagnosisContext; records: DiagnosisContext[]; visible: boolean; draftRevision: number; references: NodeReference[]; liveNodeIds: string[];
  onAddReferences: (references: NodeReference[]) => void; onSelectRecord: (id: string) => void; onRemoveReference: (id: string) => void;
  onMinimize: () => void; onViewErrors: () => void; onFocus: (id: string, field?: string) => void; onNotice: (message: string) => void;
  onApply: (plan: ConfigurationPlan) => RepairOutcome; onUndo: (plan: ConfigurationPlan) => RepairOutcome;
}) {
  const [session, setSession] = useState<Session>(() => ({ result: { ...createDiagnosisResult(context), configuration_plan: createConfigurationPlan(context) }, messages: [], input: "", feedbackEligible: Math.random() < 0.1 }));
  const [position, setPosition] = useState(() => ({ x: typeof window === "undefined" ? 72 : Math.max(72, window.innerWidth - 510), y: 150 }));
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const panel = useRef<HTMLElement>(null); const feed = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const plan = session.result.configuration_plan!;
  const applied = session.result.application?.state === "applied";
  const stale = draftRevision !== context.revision && !applied;
  // References added from a node's "引用到诊断" action enter the same editable draft.
  const composerValue = [session.input, ...references.filter((reference) => !referenceParts(session.input).includes(referenceToken(reference))).map(referenceToken)].filter(Boolean).join(" ");
  const activeReferences = mergeNodeReferences([], referenceParts(composerValue).flatMap((part) => {
    const known = references.filter((reference) => referenceToken(reference) === part);
    const parsed = readNodeReferencePaste("", part, context);
    return known.length ? known : parsed ? [parsed] : [];
  }));
  const invalid = activeReferences.filter((reference) => !resolveNodeReference(reference, context, liveNodeIds).valid);
  const hasInvalidReferences = !!invalid.length || (composerValue.match(referencePattern) ?? []).some((token) => !activeReferences.some((reference) => referenceToken(reference) === token));
  useEffect(() => { if (visible && session.messages.length && feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [visible, session.messages.length]);
  const update = (change: Partial<Session>) => setSession((current) => ({ ...current, ...change }));
  const focus = (reference: NodeReference) => {
    const resolved = resolveNodeReference(reference, context, liveNodeIds);
    if (!resolved.valid) { onNotice(resolved.reason); return; }
    onFocus(reference.nodeId, reference.field?.path); setPosition({ x: 72, y: 150 });
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, startX: position.x, startY: position.y };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    setPosition({ x: Math.max(48, Math.min(window.innerWidth - rect.width - 8, drag.current.startX + event.clientX - drag.current.x)), y: Math.max(134, Math.min(window.innerHeight - rect.height - 8, drag.current.startY + event.clientY - drag.current.y)) });
  };
  const changeDraft = (value: string) => {
    update({ input: value });
    references.filter((reference) => !referenceParts(value).includes(referenceToken(reference))).forEach((reference) => onRemoveReference(nodeReferenceKey(reference)));
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!composerValue.trim()) return;
    if (hasInvalidReferences) { onNotice("请移除失效引用，或切换到对应记录后发送"); return; }
    const question = composerValue.trim();
    const linked = activeReferences.map((reference) => context.nodes.find((node) => node.id === reference.nodeId)).filter((node) => !!node);
    let result = !session.messages.length && !context.issues.length
      ? addReportedProblems(context, session.result, question, linked.length === 1 ? linked[0].id : "", activeReferences.find((reference) => reference.field)?.field?.path ?? "")
      : addDiagnosisFollowUp(context, session.result, question);
    result = { ...result, node_references: mergeNodeReferences(result.node_references ?? [], activeReferences) };
    const location = activeReferences.length ? `已关联${activeReferences.map((reference) => `「${reference.label}${reference.field ? ` · ${reference.field.path}` : ""}」`).join("、")}。` : "";
    const answer = `${location}${session.messages.length ? "已沿用本次记录继续排查。" : context.issues.length ? `${context.source === "draft" ? "当前草稿" : `本次${sourceName(context)}`}有 ${context.issues.length} 项问题，可查看下面的定位与处理方案。` : "已记录你的问题；需要结合对应输入、输出和配置核实。"}`;
    update({ result, input: "", messages: [...session.messages, { question, answer, references: activeReferences }] });
    references.forEach((reference) => onRemoveReference(nodeReferenceKey(reference)));
    setEvidenceOpen(false);
  };
  const renderReference = (reference: NodeReference, key: string) => <NodeReferenceView key={key} reference={reference} context={context} liveNodeIds={liveNodeIds} hideIcon={false} onFocus={() => focus(reference)} onNotice={onNotice} />;
  const apply = (undo = false) => {
    const outcome = undo ? onUndo(plan) : onApply(plan); onNotice(outcome.message);
    if (outcome.ok) update({ result: { ...session.result, application: { state: undo ? "undone" : "applied", message: outcome.message } } });
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(diagnosisSummary(context, session.result)); onNotice("研发摘要已复制"); }
    catch { onNotice("请展开结构化记录后复制摘要"); }
  };
  const evidence = <section className="p2-diagnosis-evidence" aria-label="诊断依据汇总">
    <h3>诊断依据</h3>
    <p>{sourceName(context)} · 版本 {context.revision} · {context.recordedAt}</p>
    {records.length > 1 && <label>关联记录<select aria-label="诊断记录" value={context.id} onChange={(event) => onSelectRecord(event.target.value)}>{records.map((record) => <option key={record.id} value={record.id}>{sourceName(record)} · 版本 {record.revision} · {record.recordedAt}</option>)}</select></label>}
    <h4>报错信息</h4>{context.issues.length ? context.issues.map((issue, index) => <p key={index}><strong>{context.nodes.find((node) => node.id === issue.nodeId)?.label}{issue.field ? ` · ${issue.field}` : ""}</strong><br />{issue.message}</p>) : <p>当前记录没有报错信息。</p>}
    <button className="p2-evidence-link" onClick={onViewErrors}>打开对应{context.source === "trial" ? "试跑结果" : "配置检查"}<ChevronRight size={14} /></button>
    <h4>读取的日志</h4><p>当前记录暂无可用的执行日志。</p>
    <h4>算子代码</h4><p>当前记录未提供算子源码，需结合配置与执行证据核实。</p>
    <h4>本次配置</h4>{context.nodes.map((node) => <details key={node.id}><summary>{node.label}</summary><pre>{JSON.stringify({ nodeId: node.id, operatorId: node.operatorId, config: node.config, mappings: node.mappings }, null, 2)}</pre></details>)}
    <details><summary>结构化记录</summary><pre>{diagnosisSummary(context, session.result)}</pre></details>
    <button className="p2-evidence-link" onClick={copy}><Copy size={14} />复制研发摘要</button>
  </section>;
  return <section ref={panel} className="p2-diagnoser p2-diagnoser-floating" aria-label="Diagnoser 对话框" hidden={!visible} style={{ left: position.x, top: position.y }}>
    <AiAssistantCard feedRef={feed} empty={!session.messages.length && !evidenceOpen}
      header={<div className="p2-diagnoser-window-bar" onPointerDown={startDrag} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><strong>Diagnoser</strong><button aria-label="关闭 Diagnoser" title="关闭并保留对话" onClick={onMinimize}><X size={18} /></button></div>}
      context={<div className="p2-chat-context"><span>{sourceName(context)} · 版本 {context.revision}</span><button aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen(!evidenceOpen)}>{evidenceOpen ? "返回对话" : "查看依据"}</button>{stale && <small>草稿已变化，本次对话保留原记录</small>}</div>}
      composer={<form className="p2-chat-compose" onSubmit={submit}>
        <div className="p2-chat-input-shell"><ReferenceTextEditor id={`diagnoser-input-${context.id}`} label="给 Diagnoser 的消息" value={composerValue} context={context} references={activeReferences} richReferences placeholder="描述问题，或粘贴节点／字段引用…" onChange={changeDraft} onReferencePaste={(reference) => onAddReferences([reference])} onFocusReference={focus} onSubmit={submit} /><button type="submit" aria-label="发送消息" disabled={!composerValue.trim() || hasInvalidReferences}><ArrowUp size={18} /></button></div>
        {hasInvalidReferences && <p className="p2-reference-error" role="alert">引用已失效，请移除或切换对应记录。</p>}
      </form>}
    >{evidenceOpen ? evidence : session.messages.map((message, index) => <div className="p2-chat-turn" key={index}>
      <div className="p2-chat-user" aria-label="你发送的消息">{referenceParts(message.question).map((part, partIndex) => { const reference = message.references.find((reference) => referenceToken(reference) === part); return reference ? renderReference(reference, String(partIndex)) : <span key={partIndex}>{part}</span>; })}</div>
      <div className="p2-chat-answer"><strong>Diagnoser</strong><p>{message.answer}</p>
        {index === session.messages.length - 1 && <>
          {!!session.result.findings.length && <ul className="p2-chat-findings">{session.result.findings.map((finding) => <li key={finding.id}><button onClick={() => finding.location.nodeId && onFocus(finding.location.nodeId, finding.location.field)}>{finding.location.nodeLabel}{finding.location.field ? ` · ${finding.location.field}` : ""}<ChevronRight size={13} /></button><p>{finding.cause}</p></li>)}</ul>}
          {!!plan.changes.length && <details className="p2-chat-repair"><summary>查看修复方案 · {plan.changes.length} 项</summary>{plan.changes.map((change) => <article key={`${change.nodeId}-${change.key}`}><strong>{change.nodeLabel} · {change.key}</strong><dl><div><dt>修改前</dt><dd>{change.beforeLabel}</dd></div><div><dt>修改后</dt><dd>{change.afterLabel}</dd></div></dl><p>{change.reason}</p></article>)}{session.result.application && <p role="status">{session.result.application.message}</p>}{applied ? <Button variant="outline" size="sm" onClick={() => apply(true)}><Undo2 size={14} />撤销本次应用</Button> : <Button size="sm" disabled={stale || session.result.application?.state === "undone"} onClick={() => apply()}>应用方案（{plan.changes.length} 项）</Button>}</details>}
          {session.feedbackEligible && <div className="p2-diagnoser-feedback"><span>本次排查</span>{(["已确认定位", "仍未定位"] as const).map((value) => <button key={value} aria-pressed={session.feedback === value} onClick={() => update({ feedback: value })}>{value}</button>)}</div>}
        </>}
      </div>
    </div>)}</AiAssistantCard>
  </section>;
}
