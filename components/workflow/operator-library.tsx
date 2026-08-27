"use client";

import { useMemo, useState } from "react";
import { Box, GripVertical, Search, Sparkles, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/app/lib/utils";
import { controls, domainLabels, getOperatorCategory, operators, publishedFlows, type FlowDefinition, type OperatorDefinition } from "@/app/lib/workflow";
import { controlNodeStyle, getOperatorCategoryLabel, getOperatorCategoryStyle, OperatorCategoryIcon, terminalNodeStyle } from "./operator-category";

type LibraryTab = "handlers" | "flows" | "controls";

export function OperatorLibrary({ onAddOperator, onAddFlow }: { onAddOperator: (operator: OperatorDefinition) => void; onAddFlow: (flow: FlowDefinition) => void }) {
  const [tab, setTab] = useState<LibraryTab>("handlers");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("all");
  const handlers = operators.filter((operator) => operator.kind === "handler");
  const domainSource = tab === "flows" ? publishedFlows : handlers;
  const domains = useMemo(() => Array.from(new Set(domainSource.flatMap((item) => item.domains))).sort(), [domainSource]);
  const operatorSource = tab === "controls" ? controls : handlers;
  const visibleOperators = operatorSource.filter((operator) => {
    const haystack = `${operator.name} ${operator.id} ${operator.description} ${operator.capabilities.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (domain === "all" || operator.domains.includes(domain));
  });
  const visibleFlows = publishedFlows.filter((flow) => {
    const haystack = `${flow.name} ${flow.id} ${flow.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (domain === "all" || flow.domains.includes(domain));
  });

  const beginDrag = (event: React.DragEvent, operatorId: string) => {
    event.dataTransfer.setData("application/workflow-operator", operatorId);
    event.dataTransfer.effectAllowed = "copy";
  };

  const beginFlowDrag = (event: React.DragEvent, flowId: string) => {
    event.dataTransfer.setData("application/workflow-flow", flowId);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className="flex h-full min-w-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]" aria-label="节点库">
      <div className="border-b border-[var(--border)] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="搜索算子名称或 ID" aria-label="搜索算子" />
        </div>
        <div className="mt-3 grid grid-cols-3 rounded-lg bg-[var(--surface-strong)] p-1" role="tablist" aria-label="节点库类型">
          {([
            ["handlers", "算子", handlers.length],
            ["flows", "Flow", publishedFlows.length],
            ["controls", "控制", controls.length],
          ] as const).map(([value, label, count]) => (
            <button key={value} role="tab" aria-selected={tab === value} onClick={() => { setTab(value); setDomain("all"); }} className={cn("flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium text-[var(--muted-foreground)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]", tab === value && "bg-white text-[var(--foreground)] shadow-sm")}>
              {label}<span className="text-[10px] opacity-60">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {(tab === "handlers" || tab === "flows") && (
        <div className="border-b border-[var(--border)] px-3 py-2">
          <label className="sr-only" htmlFor="operator-domain">算子领域</label>
          <select id="operator-domain" value={domain} onChange={(event) => setDomain(event.target.value)} className="h-8 w-full rounded-lg border border-[var(--border-strong)] bg-white px-2 text-xs text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]">
            <option value="all">全部领域</option>
            {domains.map((item) => <option key={item} value={item}>{domainLabels[item] || item}</option>)}
          </select>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "flows" ? (
          <div className="space-y-2">
            <p className="px-1 pb-1 text-[11px] leading-5 text-[var(--muted-foreground)]">Flow 会以锁定节点组加入画布，可整体使用；解锁后可逐节点重新编排。</p>
            {visibleFlows.map((flow) => (
                <button key={flow.id} draggable onDragStart={(event) => beginFlowDrag(event, flow.id)} onClick={() => onAddFlow(flow)} className="group flex w-full cursor-grab items-start gap-3 rounded-[10px] border border-[var(--border)] bg-white p-3 text-left hover:border-[var(--border-emphasis)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted-foreground)]"><Workflow className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--foreground)]">{flow.name}</span><Badge>{flow.version}</Badge></span><span className="mt-1 block text-[11px] leading-4 text-[var(--muted-foreground)]">{flow.description}</span><span className="mt-1.5 block font-mono text-[9px] text-[var(--placeholder)]">{flow.id}</span></span>
                  <Badge className="shrink-0">{flow.nodes.length} 节点</Badge>
                </button>
            ))}
            {visibleFlows.length === 0 && <div className="flex h-40 flex-col items-center justify-center px-5 text-center"><Sparkles className="h-5 w-5 text-[var(--placeholder)]" /><p className="mt-2 text-xs font-medium text-[var(--foreground)]">没有匹配的 Flow</p></div>}
          </div>
        ) : visibleOperators.length > 0 ? (
          <div className="space-y-1.5">
            {visibleOperators.map((operator) => {
              const category = getOperatorCategory(operator);
              return <button key={operator.id} draggable onDragStart={(event) => beginDrag(event, operator.id)} onClick={() => onAddOperator(operator)} className="group flex w-full cursor-grab items-start gap-2.5 rounded-[10px] border border-transparent bg-white/70 p-2.5 text-left hover:border-[var(--border)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:cursor-grabbing">
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", category ? getOperatorCategoryStyle(category) : operator.kind === "result" || operator.id === "control.start" ? terminalNodeStyle : controlNodeStyle)}>{category ? <OperatorCategoryIcon category={category} className="h-3.5 w-3.5" /> : <Box className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="block min-w-0 flex-1 truncate text-xs font-semibold text-[var(--foreground)]">{operator.name}</span>{category && <Badge className={cn("shrink-0 text-[8px]", getOperatorCategoryStyle(category))}>{getOperatorCategoryLabel(category).split(" /")[0]}</Badge>}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-[var(--muted-foreground)]">{operator.id}</span><span className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--muted-foreground)]">{operator.description}</span></span>
                <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--placeholder)] opacity-0 group-hover:opacity-100" aria-hidden="true" />
              </button>
            })}
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center px-5 text-center"><Sparkles className="h-5 w-5 text-[var(--placeholder)]" /><p className="mt-2 text-xs font-medium text-[var(--foreground)]">没有匹配的算子</p><p className="mt-1 text-[11px] text-[var(--muted-foreground)]">尝试搜索正式算子 ID 或切换领域。</p></div>
        )}
      </div>
    </aside>
  );
}
