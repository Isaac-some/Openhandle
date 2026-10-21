"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, GitBranch, GripVertical, Layers, LoaderCircle, Search, Workflow, X } from "lucide-react";
import { domainLabels, getOperator, type FlowDefinition } from "@/app/lib/workflow";
import { Button } from "@/components/ui/button";
import { analyzeHit, canUseCapability, demoSearchAdapter, directSearch, eligibleCandidates, lineageSearch, SearchScope, selectCapabilityVersion,
  type Capability, type SearchAnalysis, type SearchFilters, type SearchHit, type SearchMode, type SearchRequest, type SearchStageStatus } from "./capability-search";
import { CAPABILITY_DRAG_MIME, capabilityDragData } from "./capability-drag";
import "./capability-discovery.css";

type Stage<T> = { status: SearchStageStatus; items: T[]; message?: string; phase?: string; startedAt?: number };
const emptyStage = <T,>(): Stage<T> => ({ status: "idle", items: [] });
type QueryState = { query: string; filters: SearchFilters };
const initialQuery = (): QueryState => ({ query: "", filters: { source: "all", domain: "all" } });
type Props = {
  open: boolean; mode: SearchMode; candidates: Capability[]; flows: FlowDefinition[];
  sourceOperatorId?: string; contextLabel?: string; onClose: () => void;
  onMode: (mode: SearchMode) => void; onAdd: (candidate: Capability) => void; onFork: (candidate: Capability) => void;
};

function CapabilityRow({ hit, analysis, selectedVersion, onVersion, onAdd, onFork }: {
  hit: SearchHit; analysis?: SearchAnalysis; selectedVersion?: string;
  onVersion: (version: string) => void; onAdd: Props["onAdd"]; onFork: Props["onFork"];
}) {
  const [expanded, setExpanded] = useState(false);
  const candidate = selectCapabilityVersion(hit.candidate, selectedVersion);
  if (!candidate) return null;
  const flow = candidate.flow;
  const operator = getOperator(candidate.operatorId ?? candidate.id);
  return <article className="discovery-result" data-candidate-id={candidate.id} draggable onDragStart={(event) => {
    if ((event.target as HTMLElement).closest("button,input,select,textarea,[contenteditable=true]")) { event.preventDefault(); return; }
    event.dataTransfer.setData(CAPABILITY_DRAG_MIME, capabilityDragData(candidate));
    event.dataTransfer.setData(flow ? "application/workflow-flow" : "application/workflow-operator", flow ? candidate.id : candidate.operatorId ?? candidate.id);
    event.dataTransfer.effectAllowed = "copy";
  }}>

    <div className="discovery-result-heading"><span className="discovery-result-icon">{flow ? <Workflow size={18} /> : <Layers size={18} />}</span><div><h4>{candidate.name}</h4><code>{candidate.id}</code></div>{flow && <span className="discovery-type">{flow.nodes.length} 步骤 · {flow.version}</span>}<span className="discovery-drag-handle" title="拖动到画布" aria-label="可拖动到画布"><GripVertical size={15} /></span></div>
    <p>{candidate.description || "暂无用途简介"}</p>
    {candidate.purpose === "understanding" && <small className="discovery-model-identity">添加时使用：{candidate.operatorId}</small>}
    {hit.reason && <div className="discovery-reason"><Check size={13} /><span>{hit.reason}</span></div>}
    <div className="discovery-result-actions"><button className="discovery-text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起详情" : flow ? "步骤与版本" : "用途与依据"}<ChevronDown size={13} /></button><Button size="sm" variant="outline" onClick={() => flow ? onFork(candidate) : onAdd(candidate)}>{flow ? "基于此版本新建" : "添加算子"}<ArrowRight size={13} /></Button></div>
    {expanded && <div className="discovery-detail">
      {flow && <><label>来源版本<select aria-label={`${candidate.name}来源版本`} value={flow.version} onChange={(event) => onVersion(event.target.value)}>{(candidate.versions ?? [flow]).map((version) => <option key={version.version} value={version.version}>{version.version}</option>)}</select></label><p>新建时复制所选版本，建议改动由你核对后手动完成。</p><ol>{flow.nodes.map((node) => <li key={node.key}><strong>{getOperator(node.operatorId)?.name ?? node.operatorId}</strong><code>{node.operatorId}</code>{Object.entries(node.config ?? {}).map(([key, value]) => <small key={key}>{key}：{String(value)}</small>)}</li>)}</ol><Button variant="outline" size="sm" onClick={() => onAdd(candidate)}>作为节点组添加到当前画布</Button></>}
      {!flow && <><strong>适用限制</strong><p>{operator?.avoidWhen || "暂无适用限制说明，请核对输入输出。"}</p><dl><dt>输入</dt><dd>{operator?.inputs.map((field) => `${field.key} · ${field.type}`).join("；") || "暂无字段资料"}</dd><dt>输出</dt><dd>{operator?.outputs.map((field) => `${field.key} · ${field.type}`).join("；") || "暂无字段资料"}</dd></dl></>}
      {hit.evidence && <><strong>连接依据</strong>{hit.evidence.map((evidence) => <p key={evidence}>{evidence}</p>)}</>}
      {analysis && <><strong>待核对项</strong>{analysis.differences.map((item) => <p key={item}>{item}</p>)}</>}
    </div>}
  </article>;
}

export function CapabilityDiscovery({ open, mode, candidates, flows, sourceOperatorId, contextLabel, onClose, onMode, onAdd, onFork }: Props) {
  const [queries, setQueries] = useState<Record<SearchMode, QueryState>>({ operator: initialQuery(), flow: initialQuery() });
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [autoAttempt, setAutoAttempt] = useState(0);
  const [related, setRelated] = useState<Stage<SearchHit>>(emptyStage);
  const [deep, setDeep] = useState<Stage<SearchAnalysis>>(emptyStage);
  const [deepRun, setDeepRun] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const autoScope = useRef(new SearchScope());
  const deepScope = useRef(new SearchScope());
  const deepStartedKey = useRef("");
  const resultScroll = useRef<HTMLDivElement>(null);
  const current = queries[mode];
  const query = current.query.trim();
  const key = JSON.stringify([open, mode, current.query, current.filters, sourceOperatorId, autoAttempt]);
  const [stageKey, setStageKey] = useState(key);
  const request: SearchRequest = useMemo(() => ({ requestId: autoAttempt, mode, query, filters: current.filters, sourceOperatorId }), [autoAttempt, mode, query, current.filters, sourceOperatorId]);
  const direct = useMemo(() => directSearch(candidates, request), [candidates, request]);
  const lineage = useMemo(() => lineageSearch(candidates, flows, request), [candidates, flows, request]);
  const browsing = useMemo(() => eligibleCandidates(candidates, request).filter((candidate) => !lineage.some((hit) => hit.candidate.id === candidate.id)).map((candidate) => ({ candidate, reason: "" })), [candidates, request, lineage]);
  const viewRelated = stageKey === key ? related : emptyStage<SearchHit>();
  const viewDeep = stageKey === key ? deep : emptyStage<SearchAnalysis>();
  if (stageKey !== key) {
    setStageKey(key);
    setRelated({ status: open && query ? "loading" : "idle", items: [] });
    setDeep(emptyStage());
  }

  useEffect(() => {
    const scope = autoScope.current;
    const deepRequestScope = deepScope.current;
    const ticket = scope.begin();
    deepRequestScope.invalidate();
    deepStartedKey.current = "";
    if (!open || !query) return () => scope.invalidate();
    const timeout = window.setTimeout(() => {
      if (!scope.isCurrent(ticket.id)) return;
      scope.invalidate();
      setRelated({ status: "timeout", items: [], message: "用途补充超过 2 秒，已停止本次等待。直接结果仍可使用。" });
    }, 2000);
    demoSearchAdapter.related(candidates, { ...request, requestId: ticket.id }, direct.map((hit) => hit.candidate.id), ticket.signal, "normal")
      .then((items) => { if (scope.isCurrent(ticket.id)) setRelated({ status: items.length ? "complete" : "empty", items }); })
      .catch((error: Error) => { if (scope.isCurrent(ticket.id) && error.name !== "AbortError") setRelated({ status: "error", items: [], message: error.message }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); scope.invalidate(); deepRequestScope.invalidate(); };
    // The serialized key includes every query/filter that invalidates a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, candidates]);

  useEffect(() => {
    if (!deepRun || !open || !query || deepStartedKey.current !== key) return;
    const scope = deepScope.current;
    const ticket = scope.begin();
    demoSearchAdapter.deep(candidates, { ...request, requestId: ticket.id }, ticket.signal, "normal", (phase) => {
      if (scope.isCurrent(ticket.id)) setDeep((stage) => ({ ...stage, phase }));
    }).then((items) => { if (scope.isCurrent(ticket.id)) setDeep((stage) => ({ ...stage, status: items.length ? "complete" : "empty", items })); })
      .catch((error: Error) => { if (scope.isCurrent(ticket.id) && error.name !== "AbortError") setDeep((stage) => ({ ...stage, status: "error", message: error.message })); });
    return () => scope.invalidate();
    // A changed key cancels this run; only the explicit button sets deepStartedKey and deepRun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepRun, key, candidates]);

  useEffect(() => {
    if (viewDeep.status !== "loading") return;
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [viewDeep.status]);

  function updateQuery(change: Partial<QueryState>) { if (resultScroll.current) resultScroll.current.scrollTop = 0; setQueries((previous) => ({ ...previous, [mode]: { ...previous[mode], ...change } })); }
  function startDeep() { deepStartedKey.current = key; const startedAt = Date.now(); setClock(startedAt); setDeep({ status: "loading", items: [], startedAt, phase: "核对本地候选资料" }); setDeepRun((value) => value + 1); }
  function retryAuto() { setAutoAttempt((value) => value + 1); }
  const displayedIds = new Set([...direct, ...viewRelated.items].map((hit) => hit.candidate.id));
  const checked = (candidate: Capability, action: Props["onAdd"]) => { if (canUseCapability(candidate)) action(candidate); };
  const row = (hit: SearchHit, analysis?: SearchAnalysis) => <CapabilityRow key={hit.candidate.id} hit={hit} analysis={analysis} selectedVersion={versions[hit.candidate.id]} onVersion={(version) => { setVersions((previous) => ({ ...previous, [hit.candidate.id]: version })); deepScope.current.invalidate(); setDeep(emptyStage()); }} onAdd={(candidate) => checked(candidate, onAdd)} onFork={(candidate) => checked(candidate, onFork)} />;
  if (!open) return null;
  const elapsed = viewDeep.startedAt ? Math.max(0, (clock - viewDeep.startedAt) / 1000).toFixed(1) : "0.0";
  return <aside className="p2-library discovery-panel" aria-label={mode === "operator" ? "添加算子检索" : "复用 Flow 检索"}>
    <header><div><h2>{mode === "operator" ? "添加算子" : "复用 Flow"}</h2><p>{mode === "operator" ? contextLabel || "找到这一步需要的处理能力" : "拖入画布复用，或基于已有方案新建草稿"}</p></div><button aria-label="关闭检索" onClick={onClose}><X size={18} /></button></header>
    <div className="discovery-mode" aria-label="检索对象"><button aria-pressed={mode === "operator"} onClick={() => onMode("operator")}><Layers size={15} />找算子</button><button aria-pressed={mode === "flow"} onClick={() => onMode("flow")}><Workflow size={15} />找 Flow</button></div>
    <div className="discovery-query"><Search size={17} /><input key={mode} autoFocus aria-label={mode === "operator" ? "搜索算子用途" : "搜索 Flow 目标与改动"} value={current.query} onChange={(event) => updateQuery({ query: event.target.value })} placeholder={mode === "operator" ? "用途、名称或 ID" : "整体目标，以及希望改哪里"} />{current.query && <button aria-label="清空检索" onClick={() => updateQuery({ query: "" })}><X size={14} /></button>}</div>
    {!query && <div className="discovery-examples"><span>试试</span>{(mode === "operator" ? ["csv.unique", "去掉重复数据", "把视频存到对象存储"] : ["视频预览", "生成预览，改成 720p", "视频标注，换成 Qwen"]).map((example) => <button key={example} onClick={() => updateQuery({ query: example })}>{example}</button>)}</div>}
    <div className="discovery-filters">{mode === "flow" && <select aria-label="Flow 来源" value={current.filters.source} onChange={(event) => updateQuery({ filters: { ...current.filters, source: event.target.value as SearchFilters["source"] } })}><option value="all">全部来源</option><option value="engineering">研发发布</option><option value="custom">用户发布</option></select>}<select aria-label="检索领域" value={current.filters.domain} onChange={(event) => updateQuery({ filters: { ...current.filters, domain: event.target.value } })}><option value="all">全部领域</option>{Object.entries(domainLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
    {query && <div className="discovery-stage-overview" aria-label="检索阶段概览"><span><strong>直接匹配</strong>{direct.length} 项</span><span><strong>相关用途</strong>{viewRelated.status === "loading" ? "补充中…" : viewRelated.status === "timeout" ? "等待超时" : viewRelated.status === "error" ? "失败可重试" : `${viewRelated.items.length} 项补充`}</span><span><strong>深入搜索</strong>{viewDeep.status === "loading" ? "核对中…" : viewDeep.status === "complete" ? "已完成" : viewDeep.status === "cancelled" ? "已取消" : viewDeep.status === "error" ? "失败可重试" : "手动触发"}</span></div>}
    <div className="discovery-scroll" key={mode} ref={resultScroll}>
      {!query ? <><div className="discovery-intro"><BookOpen size={18} /><p>{mode === "operator" ? "按用途找能力，添加到当前编排。" : "基于已发布的可复用 Flow 创建自己的草稿，原方案保留。"}</p></div>{lineage.length > 0 && <section className="discovery-stage"><div className="discovery-stage-title"><h3><GitBranch size={15} />历史连接推荐</h3><span>历史连线依据</span></div>{lineage.map((hit) => row(hit))}</section>}<section className="discovery-stage"><div className="discovery-stage-title"><h3>{mode === "operator" ? "浏览算子" : "可复用方案"}</h3><span>{browsing.length} 项</span></div>{browsing.map((hit) => row(hit))}{!browsing.length && <p className="discovery-state">当前筛选下暂无可用能力，请调整领域或来源。</p>}</section></> : <>
        <section className="discovery-stage" aria-label="直接匹配结果"><div className="discovery-stage-title"><h3>直接匹配</h3><span>即刻可用 · {direct.length} 项</span></div>{direct.map((hit) => row(hit))}{!direct.length && <p className="discovery-state">没有直接文字匹配，继续查看下方用途补充。</p>}</section>
        <section className="discovery-stage" aria-label="相关用途结果"><div className="discovery-stage-title"><h3>相关用途</h3><span>{viewRelated.status === "loading" ? "检索中" : "用途匹配"}</span></div><div className="discovery-stage-status" role="status" aria-live="polite">{viewRelated.status === "loading" && <><LoaderCircle size={15} className="p2-spin" />正在补充不同说法的候选…</>}{viewRelated.status === "empty" && "未找到其他用途候选，已有结果保持可用。"}{viewRelated.status === "complete" && `${viewRelated.items.length} 项补充结果 · 未重复展示直接匹配`}{(viewRelated.status === "error" || viewRelated.status === "timeout") && <><span>{viewRelated.message}</span><button onClick={retryAuto}>重试用途补充</button></>}</div>{viewRelated.items.map((hit) => row(hit))}</section>
        <section className="discovery-stage discovery-deep" aria-label="深入搜索结果"><div className="discovery-stage-title"><h3>深入搜索</h3><span>按需进行</span></div><p className="discovery-stage-description">{mode === "operator" ? "还不确定用哪个？进一步核对用途与限制。" : "结合整体目标与改动，核对步骤、配置及差异。"}可等待 5 秒或更久，已有结果继续可用。</p>
          {viewDeep.status === "loading" && <p className="discovery-stage-status" role="status"><LoaderCircle size={15} className="p2-spin" />{viewDeep.phase}</p>}
          <div className="discovery-stage-status" aria-live="polite">{viewDeep.status === "cancelled" && "深入搜索已取消，已有结果保持可用。"}{viewDeep.status === "empty" && "没有找到有资料支持的候选，请换一种用途描述。"}{viewDeep.status === "error" && viewDeep.message}{viewDeep.status === "complete" && `已核对 ${viewDeep.items.length} 个候选`}</div>
          {viewDeep.items.map((hit) => {
            const candidate = selectCapabilityVersion(hit.candidate, versions[hit.candidate.id]);
            if (!candidate) return null;
            const analysis = analyzeHit({ ...hit, candidate }, request);
            return <div className="discovery-analysis" key={candidate.id}>{displayedIds.has(candidate.id) ? <><h4>{candidate.name}</h4><small>补充上方已有候选的判断</small></> : row({ ...hit, candidate }, analysis)}<strong>需要核对或修改</strong>{analysis.differences.map((difference) => <p key={difference}>{difference}</p>)}<strong>资料依据</strong>{analysis.evidence?.map((evidence) => <code key={evidence}>{evidence}</code>)}{analysis.limitations.map((limitation) => <p className="discovery-limitation" key={limitation}>{limitation}</p>)}</div>;
          })}
        </section>
      </>}

    </div>
    {query && <div className="discovery-deep-launch"><div><strong>{viewDeep.status === "loading" ? "正在深入核对" : "需要更明确的判断？"}</strong><span className="discovery-elapsed"><Clock3 size={12} />{viewDeep.status === "loading" ? `已等待 ${elapsed} 秒` : "主动搜索可等待 5 秒或更久"}</span></div>{viewDeep.status === "loading" ? <button onClick={() => { deepScope.current.invalidate(); setDeep((stage) => ({ ...stage, status: "cancelled" })); }}>取消深入搜索</button> : <Button variant="outline" size="sm" onClick={startDeep}><Search size={13} />{viewDeep.status === "idle" ? "深入搜索" : "重新深入搜索"}</Button>}</div>}
  </aside>;
}
