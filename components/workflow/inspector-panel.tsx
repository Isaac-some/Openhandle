"use client";

import { AlertTriangle, ChevronDown, ChevronUp, Copy, Database, Info, LockKeyhole, Plus, Settings2, Trash2, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/app/lib/utils";
import { getConditionRules, getConfigBounds, getNodeOutputFields, getOperator, getOperatorCategory, type BuilderEdge, type BuilderNode, type ConditionRule, type FieldMapping } from "@/app/lib/workflow";
import { getOperatorCategoryLabel, getOperatorCategoryStyle } from "./operator-category";

interface InspectorPanelProps {
  node?: BuilderNode;
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  onUpdate: (nodeId: string, updater: (data: BuilderNode["data"]) => BuilderNode["data"]) => void;
  onConditionRulesChange: (nodeId: string, rules: ConditionRule[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function InspectorPanel({ node, nodes, edges, onUpdate, onConditionRulesChange, onDelete, onDuplicate }: InspectorPanelProps) {
  if (!node) {
    return (
      <aside className="flex h-full flex-col border-l border-[var(--border)] bg-[var(--surface)]" aria-label="节点配置">
        <div className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-semibold">节点配置</h2></div>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><Settings2 className="h-7 w-7 text-[var(--placeholder)]" /><p className="mt-3 text-sm font-medium">选择一个节点</p><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">查看完整输入、字段来源、算子配置和精确输出。</p></div>
      </aside>
    );
  }

  const operator = getOperator(node.data.operatorId);
  if (!operator) return null;
  const category = getOperatorCategory(operator);
  const upstreamNodes = edges.filter((edge) => edge.target === node.id).map((edge) => nodes.find((item) => item.id === edge.source)).filter(Boolean) as BuilderNode[];
  const effectiveFields = getNodeOutputFields(node.id, nodes, edges);

  const updateMapping = (fieldKey: string, rawValue: string) => {
    let mapping: FieldMapping;
    if (rawValue.startsWith("upstream:")) {
      const [, sourceNodeId, ...fieldParts] = rawValue.split(":");
      mapping = { sourceType: "upstream", sourceNodeId, sourceField: fieldParts.join(":") };
    } else if (rawValue === "fixed") mapping = { sourceType: "fixed", value: "" };
    else if (rawValue === "parameter") mapping = { sourceType: "parameter", value: fieldKey };
    else mapping = { sourceType: "system", value: fieldKey };
    onUpdate(node.id, (data) => ({ ...data, mappings: { ...data.mappings, [fieldKey]: mapping } }));
  };

  const updateMappingValue = (fieldKey: string, value: string) => {
    onUpdate(node.id, (data) => ({ ...data, mappings: { ...data.mappings, [fieldKey]: { ...(data.mappings[fieldKey] || { sourceType: "fixed" }), value } } }));
  };

  const updateConfig = (key: string, value: string | number | boolean) => {
    onUpdate(node.id, (data) => ({ ...data, config: { ...data.config, [key]: value } }));
  };

  return (
    <aside className="flex h-full min-w-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]" aria-label={`${node.data.label} 节点配置`}>
      <div className="border-b border-[var(--border)] bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="flex items-center gap-2"><Badge className={category ? getOperatorCategoryStyle(category) : undefined}>{category ? getOperatorCategoryLabel(category) : node.data.operatorId === "control.start" ? "启动" : node.data.operatorId === "control.aggregate" ? "聚合" : node.data.kind === "result" ? "结束" : "控制"}</Badge>{node.data.validationCount > 0 && <Badge className="border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]">{node.data.validationCount} 个错误</Badge>}</div><h2 className="mt-2 truncate text-sm font-semibold" title={node.data.label}>{node.data.label}</h2><p className="mt-0.5 truncate font-mono text-[10px] text-[var(--muted-foreground)]">{operator.id}</p></div>
          <div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" onClick={onDuplicate} aria-label="复制节点"><Copy className="h-4 w-4" /></Button><Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label="删除节点"><Trash2 className="h-4 w-4" /></Button></div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {operator.id === "control.condition" && <ConditionRulesEditor nodeId={node.id} rules={getConditionRules(node.data.config)} onChange={(rules) => onConditionRulesChange(node.id, rules)} />}

        <section className="border-b border-[var(--border)] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold"><Info className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />用途</div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">{operator.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{operator.domains.map((domain) => <Badge key={domain}>{domain}</Badge>)}<Badge>{operator.cardinality}</Badge></div>
        </section>

        {operator.kind === "flow" && (
          <section className="border-b border-[var(--border)] p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-xs font-semibold"><LockKeyhole className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />内部步骤</h3><span className="text-[10px] text-[var(--muted-foreground)]">只读</span></div>
            <div className="mt-3 space-y-1.5">{operator.internalOperators?.map((operatorId, index) => <div key={operatorId} className="flex items-center gap-2 rounded-lg bg-[var(--surface-strong)] px-3 py-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-[10px] font-semibold text-[var(--muted-foreground)]">{index + 1}</span><span className="min-w-0 truncate font-mono text-[10px]">{operatorId}</span></div>)}</div>
            <p className="mt-2 text-[10px] leading-4 text-[var(--muted-foreground)]">可查看执行组成，但不能在当前 Pipeline 中新建、删除或改写内部算子。</p>
          </section>
        )}

        <section className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Database className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />输入与来源</h3><span className="text-[10px] text-[var(--muted-foreground)]">{operator.inputs.length} 个字段</span></div>
          {operator.inputs.length === 0 ? <p className="rounded-lg bg-[var(--surface-strong)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">该算子没有已登记的固定输入字段。</p> : (
            <div className="space-y-4">
              {operator.inputs.map((field) => {
                const mapping = node.data.mappings[field.key];
                const selectedValue = mapping?.sourceType === "upstream" ? `upstream:${mapping.sourceNodeId}:${mapping.sourceField}` : mapping?.sourceType || "";
                const systemLocked = Boolean(field.system);
                return (
                  <div key={field.key} className={cn("rounded-[10px] border bg-white p-3", field.required && !mapping ? "border-[var(--danger-border)]" : "border-[var(--border)]")}>
                    <div className="flex items-start justify-between gap-2"><label htmlFor={`${node.id}-${field.key}`} className="break-all font-mono text-[11px] font-semibold text-[var(--foreground)]">{field.key}{field.required && <span className="ml-1 text-[var(--danger)]" aria-label="必填">*</span>}</label><Badge className="shrink-0">{field.type}{field.cardinality === "many" ? "[]" : ""}</Badge></div>
                    <p className="mt-1 break-all text-[10px] text-[var(--muted-foreground)]">{field.semanticType}</p>
                    <select id={`${node.id}-${field.key}`} disabled={systemLocked} value={systemLocked ? "system" : selectedValue} onChange={(event) => updateMapping(field.key, event.target.value)} className="mt-2 h-8 w-full rounded-lg border border-[var(--border-strong)] bg-white px-2 text-[11px] outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:bg-[var(--surface-strong)]">
                      <option value="">选择字段来源…</option>
                      {upstreamNodes.flatMap((sourceNode) => {
                        const sourceOperator = getOperator(sourceNode.data.operatorId);
                        return (sourceOperator?.outputs || []).map((output) => <option key={`${sourceNode.id}-${output.key}`} value={`upstream:${sourceNode.id}:${output.key}`}>{sourceNode.data.label} · {output.key}</option>);
                      })}
                      <option value="parameter">Pipeline / Batch 参数</option>
                      <option value="fixed">固定值</option>
                      <option value="system">系统字段</option>
                    </select>
                    {systemLocked && <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]"><LockKeyhole className="h-3 w-3" />系统身份键已锁定，不允许覆盖</p>}
                    {mapping && ["fixed", "parameter"].includes(mapping.sourceType) && <Input value={mapping.value || ""} onChange={(event) => updateMappingValue(field.key, event.target.value)} className="mt-2 h-8 font-mono text-[11px]" placeholder={mapping.sourceType === "fixed" ? "输入固定值" : "输入参数名"} aria-label={`${field.key} ${mapping.sourceType === "fixed" ? "固定值" : "参数名"}`} />}
                    {mapping?.sourceType === "upstream" && !upstreamNodes.some((item) => item.id === mapping.sourceNodeId) && <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--danger)]"><Unplug className="h-3 w-3" />来源连线已断开，请重新选择</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border-b border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold"><Settings2 className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />算子配置</h3><span className="text-[10px] text-[var(--muted-foreground)]">{operator.config.length} 项</span></div>
          {operator.config.length === 0 ? <p className="rounded-lg bg-[var(--surface-strong)] px-3 py-2 text-[11px] text-[var(--muted-foreground)]">{operator.id === "control.condition" ? "分流规则已在上方按命中顺序配置。" : "该算子无需额外配置。"}</p> : <div className="space-y-3">{operator.config.map((field) => {
            const value = node.data.config[field.key];
            const selections = field.constraints?.match(/selections:([^;]+)/)?.[1]?.split(",") || [];
            const isLong = /prompt|提示词|表达式|条件/i.test(field.key);
            const numeric = ["Int", "Float", "Number"].includes(field.type);
            const bounds = getConfigBounds(field);
            const updateNumeric = (raw: string) => {
              if (raw === "") { updateConfig(field.key, ""); return; }
              let next = Number(raw);
              if (!Number.isFinite(next)) return;
              if (bounds.min !== undefined) next = Math.max(bounds.min, next);
              if (bounds.max !== undefined) next = Math.min(bounds.max, next);
              updateConfig(field.key, next);
            };
            return <div key={field.key}><div className="mb-1.5 flex items-center justify-between gap-2"><label className="block text-[11px] font-medium" htmlFor={`${node.id}-config-${field.key}`}>{field.key}{field.required && <span className="ml-1 text-[var(--danger)]">*</span>}</label>{bounds.hint && <span className="text-[10px] text-[var(--muted-foreground)]">{bounds.hint}</span>}</div>{field.type === "Boolean" ? <label className="flex h-9 cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] bg-white px-3 text-xs"><span>{value ? "已开启" : "已关闭"}</span><input id={`${node.id}-config-${field.key}`} type="checkbox" checked={Boolean(value)} onChange={(event) => updateConfig(field.key, event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /></label> : selections.length > 0 ? <select id={`${node.id}-config-${field.key}`} value={String(value ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)} className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-[var(--ring)]">{selections.map((selection) => <option key={selection} value={selection}>{selection}</option>)}</select> : isLong ? <Textarea id={`${node.id}-config-${field.key}`} value={String(value ?? "")} onChange={(event) => updateConfig(field.key, event.target.value)} className="min-h-20 font-mono text-[11px]" /> : <Input id={`${node.id}-config-${field.key}`} type={numeric ? "number" : "text"} min={bounds.min} max={bounds.max} value={String(value ?? "")} onChange={(event) => numeric ? updateNumeric(event.target.value) : updateConfig(field.key, event.target.value)} className="text-xs" />}</div>;
          })}</div>}
        </section>

        <section className="border-b border-[var(--border)] p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-semibold">当前数据字段</h3><span className="text-[10px] text-[var(--muted-foreground)]">继承 + 新增 · {effectiveFields.length} 个</span></div><div className="mt-3 space-y-2">{effectiveFields.length === 0 ? <p className="text-[11px] text-[var(--muted-foreground)]">当前线路还没有可向后传递的字段。</p> : effectiveFields.map((output) => <div key={output.key} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-strong)] px-3 py-2"><span className="min-w-0 truncate font-mono text-[11px]">{output.key}</span><Badge className="shrink-0">{output.type}{output.cardinality === "many" ? "[]" : ""}</Badge></div>)}</div></section>

        {operator.risks.length > 0 && <section className="p-4"><h3 className="flex items-center gap-2 text-xs font-semibold text-[var(--warning-strong)]"><AlertTriangle className="h-3.5 w-3.5" />使用边界</h3><ul className="mt-2 space-y-2">{operator.risks.map((risk) => <li key={risk} className="text-[11px] leading-5 text-[var(--muted-foreground)]">{risk}</li>)}</ul></section>}
      </div>
    </aside>
  );
}

function ConditionRulesEditor({ nodeId, rules, onChange }: { nodeId: string; rules: ConditionRule[]; onChange: (rules: ConditionRule[]) => void }) {
  const updateRule = (ruleId: string, patch: Partial<ConditionRule>) => onChange(rules.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  const moveRule = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const addRule = () => {
    if (rules.length >= 10) return;
    const sequence = rules.length + 1;
    onChange([...rules, { id: `rule-${Date.now().toString(36)}-${sequence}`, label: `规则 ${sequence}`, expression: "true" }]);
  };

  return (
    <section className="border-b border-[var(--border)] p-4" aria-label="分流规则">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-xs font-semibold">分流规则</h3><p className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">从上到下首个命中；支持 1–10 条规则。</p></div>
        <Badge>{rules.length} / 10</Badge>
      </div>
      <div className="mt-3 space-y-2.5">
        {rules.map((rule, index) => (
          <div key={rule.id} className="rounded-[10px] border border-[var(--border)] bg-white p-3">
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--control-soft)] text-[10px] font-semibold text-[var(--control-strong)]">{index + 1}</span>
              <Input value={rule.label} onChange={(event) => updateRule(rule.id, { label: event.target.value })} className="h-8 min-w-0 flex-1 text-[11px]" aria-label={`第 ${index + 1} 条分流名称`} />
              <Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => moveRule(index, -1)} aria-label={`上移 ${rule.label}`}><ChevronUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" disabled={index === rules.length - 1} onClick={() => moveRule(index, 1)} aria-label={`下移 ${rule.label}`}><ChevronDown className="h-3.5 w-3.5" /></Button>
              <Button size="icon-sm" variant="ghost" disabled={rules.length <= 1} onClick={() => onChange(rules.filter((item) => item.id !== rule.id))} aria-label={`删除 ${rule.label}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <Textarea id={`${nodeId}-condition-${rule.id}`} value={rule.expression} onChange={(event) => updateRule(rule.id, { expression: event.target.value })} className="mt-2 min-h-16 font-mono text-[11px]" aria-label={`${rule.label} 表达式`} />
          </div>
        ))}
        <div className="rounded-[10px] border border-[var(--control-border)] bg-[var(--control-soft)] px-3 py-2.5">
          <div className="flex items-center justify-between"><span className="text-[11px] font-semibold text-[var(--control-strong)]">Else</span><Badge className="border-[var(--control-border)] bg-white text-[var(--control-strong)]">必须保留</Badge></div>
          <p className="mt-1 text-[10px] leading-4 text-[var(--muted-foreground)]">承接未命中任何规则的数据，确保不会空置。</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={addRule} disabled={rules.length >= 10}><Plus className="h-3.5 w-3.5" />添加分流规则</Button>
    </section>
  );
}
