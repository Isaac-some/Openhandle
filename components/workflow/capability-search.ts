import { getOperator, type FlowDefinition } from "@/app/lib/workflow";

export type SearchMode = "operator" | "flow";
export type Capability = {
  id: string; name: string; description: string; domains: string[];
  kind: "node" | "flow"; source: "engineering" | "custom";
  operatorId?: string; purpose?: "understanding" | "generation";
  flow?: FlowDefinition; versions?: FlowDefinition[];
  aliases?: string[]; authorized?: boolean; available?: boolean; published?: boolean;
};
export type SearchFilters = { source: "all" | "engineering" | "custom"; domain: string };
export type SearchRequest = {
  requestId: number; mode: SearchMode; query: string; filters: SearchFilters;
  sourceOperatorId?: string;
};
export type SearchHit = { candidate: Capability; reason: string; evidence?: string[] };
export type SearchAnalysis = SearchHit & { differences: string[]; limitations: string[] };
export type DemoScenario = "normal" | "timeout" | "error" | "deep-error";
export type SearchStageStatus = "idle" | "loading" | "complete" | "empty" | "error" | "timeout" | "cancelled";

const aliases: Record<string, string[]> = {
  "csv.unique": ["去重", "重复数据", "重复行", "deduplicate"],
  "purpose.understanding": ["Gemini", "DeepSeek", "Qwen", "ai-platform.gemini", "ai-platform.deepseek", "ai-platform.qwen_tmp1", "内容标注", "打标签"],
  "purpose.generation": ["Seedream", "图生图"],
  "vod.upload.tos": ["视频转存", "转到 TOS"],
};
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
export function canUseCapability(candidate: Capability) {
  return candidate.authorized !== false && candidate.available !== false && candidate.published !== false;
}
export function selectCapabilityVersion(candidate: Capability, version?: string): Capability | null {
  if (!canUseCapability(candidate)) return null;
  if (!candidate.flow) return candidate;
  const flow = (candidate.versions ?? [candidate.flow]).find((item) => item.version === (version ?? candidate.flow!.version));
  return flow ? { ...candidate, flow, description: flow.description } : null;
}
export function eligibleCandidates(candidates: Capability[], request: SearchRequest) {
  return candidates.filter((candidate) => canUseCapability(candidate)
    && candidate.kind === (request.mode === "operator" ? "node" : "flow")
    && (request.filters.source === "all" || candidate.source === request.filters.source)
    && (request.filters.domain === "all" || candidate.domains.includes(request.filters.domain)));
}
function corpus(candidate: Capability) {
  return [candidate.id, candidate.operatorId ?? "", candidate.name, candidate.description,
    ...(candidate.aliases ?? aliases[candidate.id] ?? []),
    ...(candidate.flow?.nodes.map((node) => `${node.operatorId} ${getOperator(node.operatorId)?.name ?? ""} ${JSON.stringify(node.config ?? {})}`) ?? [])].map(normalize);
}
function candidateForQuery(candidate: Capability, query: string): Capability {
  if (candidate.purpose !== "understanding") return candidate;
  const models = [{ name: "gemini", id: "ai-platform.gemini" }, { name: "deepseek", id: "ai-platform.deepseek" }, { name: "qwen", id: "ai-platform.qwen_tmp1" }];
  const matches = models.filter((model) => normalize(query).includes(model.name));
  return matches.length === 1 ? { ...candidate, operatorId: matches[0].id } : candidate;
}
// One edit only, for short Latin identifiers. User input is never a regular expression.
function nearWord(query: string, word: string): boolean {
  if (Math.abs(query.length - word.length) > 1) return false;
  if (query.length === word.length) return [...query].filter((char, index) => char !== word[index]).length === 1;
  const [short, long] = query.length < word.length ? [query, word] : [word, query];
  let i = 0, j = 0, edits = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; } else { j++; if (++edits > 1) return false; }
  }
  return true;
}
export function directSearch(candidates: Capability[], request: SearchRequest): SearchHit[] {
  const query = normalize(request.query);
  if (!query) return [];
  return eligibleCandidates(candidates, request).flatMap((candidate) => {
    const terms = corpus(candidate);
    const exact = normalize(candidate.id) === query || normalize(candidate.operatorId ?? "") === query || normalize(candidate.name) === query;
    const alias = (candidate.aliases ?? aliases[candidate.id] ?? []).find((term) => normalize(term) === query);
    const contains = terms.some((term) => term.includes(query));
    const tokens = query.split(/\s+/).filter(Boolean);
    const partial = tokens.length > 1 && tokens.every((token) => terms.some((term) => term.includes(token)));
    const fuzzy = /^[a-z][a-z0-9._-]{3,63}$/.test(query) && terms.some((term) => term.split(/[^a-z0-9._-]+/).some((word) => nearWord(query, word)));
    if (!(exact || alias || contains || partial || fuzzy)) return [];
    return [{ candidate: candidateForQuery(candidate, query), reason: exact ? "名称或 ID 精确匹配" : alias ? `别名匹配：${alias}` : fuzzy && !contains ? "近似拼写匹配，请核对名称与 ID" : "名称、简介或步骤中的文字匹配", score: exact ? 4 : alias ? 3 : contains ? 2 : 1 }];
  }).sort((a, b) => b.score - a.score).map(({ candidate, reason }) => ({ candidate, reason }));
}

// Curated topic rules demonstrate delayed semantic results; no embedding/model is called.
const topics: { query: RegExp; document: RegExp; label: string }[] = [
  { query: /重复|去重|一样的|相同的|dedup/i, document: /去重|unique|重复/, label: "去除重复记录" },
  { query: /标注|标签|概括|理解|总结|qwen|gemini|deepseek/i, document: /标注|理解|打标|ai-platform|watermark/i, label: "内容理解与标注" },
  { query: /水印|logo|字幕/i, document: /水印|watermark|logo/i, label: "识别或筛除水印" },
  { query: /预览|清晰度|[0-9]{3,4}p|播放地址|转码|看小样/i, document: /预览|transcod|preview/i, label: "视频转码与预览" },
  { query: /视频.*(?:宽|高|时长)|分辨率|元数据|metadata/i, document: /元数据|metadata|vod.video.get|expr.check/i, label: "视频信息与规则校验" },
  { query: /人工|回传|审核/i, document: /人工|回传|human-review|control.wait/i, label: "人工回传" },
  { query: /转存|搬到|存到|落到|存储|可访问|tos/i, document: /转存|上传|upload|tos/i, label: "视频转存与存储" },
  { query: /图片.*生成|生图|换背景/i, document: /图片生成|seedream/i, label: "图片生成" },
];
export function relatedSearch(candidates: Capability[], request: SearchRequest, excludeIds: string[] = []): SearchHit[] {
  const matching = topics.filter((topic) => topic.query.test(request.query));
  return eligibleCandidates(candidates, request).flatMap((candidate) => {
    if (excludeIds.includes(candidate.id)) return [];
    const topic = matching.find((item) => item.document.test(corpus(candidate).join(" ")));
    return topic ? [{ candidate: candidateForQuery(candidate, request.query), reason: `用途关联：${topic.label}` }] : [];
  });
}
export function lineageSearch(candidates: Capability[], flows: FlowDefinition[], request: SearchRequest): SearchHit[] {
  if (!request.sourceOperatorId || request.mode !== "operator") return [];
  const hits = new Map<string, SearchHit>();
  for (const flow of flows) for (const edge of flow.edges) {
    const source = flow.nodes.find((node) => node.key === edge.source);
    const target = flow.nodes.find((node) => node.key === edge.target);
    if (source?.operatorId !== request.sourceOperatorId || !target) continue;
    const candidate = eligibleCandidates(candidates, request).find((item) => item.operatorId === target.operatorId || (item.purpose === "understanding" && aliases[item.id]?.includes(target.operatorId)));
    if (!candidate) continue;
    const evidence = `${flow.name} · ${flow.id} · ${flow.version}：${source.key}${edge.sourceField ? `.${edge.sourceField}` : ""} → ${target.key}${edge.targetField ? `.${edge.targetField}` : ""}`;
    const hit = hits.get(candidate.id) ?? { candidate, reason: "已有样例流程中曾直接衔接；不代表运行成功", evidence: [] };
    if (!hit.evidence!.includes(evidence)) hit.evidence!.push(evidence);
    hits.set(candidate.id, hit);
  }
  return [...hits.values()];
}

export function analyzeHit(hit: SearchHit, request: SearchRequest): SearchAnalysis {
  const flow = hit.candidate.flow;
  const differences: string[] = [];
  const clarity = request.query.match(/\b(240|360|480|720|1080)p\b/i)?.[0].toLowerCase();
  if (flow) {
    if (clarity) {
      const fields = flow.nodes.flatMap((node) => Object.entries(node.config ?? {}).filter(([key]) => key.includes("清晰度")).map(([key, value]) => `${getOperator(node.operatorId)?.name ?? node.operatorId}：${key} = ${value}`));
      differences.push(...(fields.length ? fields.map((field) => `${field}；目标为 ${clarity}，请核对后手动修改。`) : ["当前资料未记录清晰度配置，不能判断能否满足目标。"]));
    }
    const model = request.query.match(/qwen|gemini|deepseek/i)?.[0];
    if (model) {
      const modelSteps = flow.nodes.filter((node) => /ai-platform/.test(node.operatorId));
      differences.push(...(modelSteps.length ? modelSteps.map((node) => `现有模型步骤：${node.operatorId}；希望使用 ${model}，模型接口与输出契约需核对，不自动替换。`) : [`当前资料未记录可直接切换为 ${model} 的通用模型步骤，不能承诺只换一个参数即可。`]));
    }
  }
  if (!differences.length) differences.push(flow ? "已列出实际步骤；本次未识别到可核对的具体改动，请自行检查配置和字段契约。" : "用途相关仍需核对输入、输出与适用条件；不会自动连接或配置。");
  const operator = getOperator(hit.candidate.operatorId ?? hit.candidate.id);
  return { ...hit, differences,
    evidence: flow ? [`${flow.id} · ${flow.version}`, ...flow.nodes.map((node) => `${node.key}：${node.operatorId}`)] : [hit.candidate.operatorId ?? hit.candidate.id, hit.candidate.description],
    limitations: [operator?.avoidWhen ?? "现有资料不足以判断运行效果与业务质量。"],
  };
}
export class SearchScope {
  private sequence = 0;
  private controller = new AbortController();
  begin() { this.controller.abort(); this.controller = new AbortController(); return { id: ++this.sequence, signal: this.controller.signal }; }
  invalidate() { this.controller.abort(); ++this.sequence; }
  isCurrent(id: number) { return id === this.sequence && !this.controller.signal.aborted; }
}
export function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new DOMException("Cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export const demoSearchAdapter = {
  async related(candidates: Capability[], request: SearchRequest, excludeIds: string[], signal: AbortSignal, scenario: DemoScenario): Promise<SearchHit[]> {
    await abortableDelay(scenario === "timeout" ? 3200 : 1350, signal);
    if (scenario === "error") throw new Error("用途补充失败，请重试。");
    return relatedSearch(candidates, request, excludeIds);
  },
  async deep(candidates: Capability[], request: SearchRequest, signal: AbortSignal, scenario: DemoScenario, onPhase: (phase: string) => void): Promise<SearchAnalysis[]> {
    await abortableDelay(1900, signal);
    const direct = directSearch(candidates, request);
    const related = relatedSearch(candidates, request, direct.map((hit) => hit.candidate.id));
    onPhase("比对步骤、版本与配置");
    await abortableDelay(2600, signal);
    if (scenario === "deep-error") throw new Error("深入搜索失败，已有结果仍可使用。");
    const result = [...direct, ...related].map((hit) => analyzeHit(hit, request));
    onPhase("整理匹配依据与待核对项");
    await abortableDelay(1700, signal);
    return result;
  },
};
