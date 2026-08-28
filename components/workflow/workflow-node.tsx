"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertCircle, CheckCircle2, Clock3, GitBranch, ListFilter, LoaderCircle, Plus, Split } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/app/lib/utils";
import { getOperator, getOperatorCategory, getOperatorRoutes, type BuilderNode } from "@/app/lib/workflow";
import { controlNodeStyle, getOperatorCategoryLabel, getOperatorCategoryStyle, OperatorCategoryIcon, terminalNodeStyle } from "./operator-category";

export function WorkflowNode({ id, data, selected }: NodeProps<BuilderNode>) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const operator = getOperator(data.operatorId);
  const category = operator ? getOperatorCategory(operator) : undefined;
  const terminal = data.operatorId === "control.start" || data.kind === "result";
  const tone = terminal ? terminalNodeStyle : category ? getOperatorCategoryStyle(category) : controlNodeStyle;
  const surface = terminal
    ? "border-[var(--terminal-border)] bg-[var(--terminal-surface)]"
    : category
      ? "border-[var(--operator-border)] bg-[var(--operator-surface)]"
      : "border-[var(--control-border)] bg-[var(--control-surface)]";
  const hasErrors = data.validationCount > 0;
  const runState = data.runState || "idle";
  const routes = getOperatorRoutes(data.operatorId, data.config);
  const ControlIcon = data.operatorId === "control.split" ? Split : data.operatorId === "control.filter" ? ListFilter : GitBranch;
  const runTone = runState === "succeeded" ? "text-[var(--success)]" : runState === "pending" ? "text-[var(--warning-strong)]" : runState === "running" ? "text-[var(--connection)]" : runState === "failed" ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]";

  return (
    <div className="group relative w-[220px]">
      <article
        data-node-id={data.operatorId}
        data-node-category={category}
        data-node-role={terminal ? "terminal" : category ? "operator" : "control"}
        data-run-state={runState}
        className={cn(
        "relative w-[220px] overflow-hidden rounded-[10px] border transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
        surface,
        selected ? "shadow-[0_0_0_2px_var(--focus-soft),var(--shadow-node)]" : "hover:shadow-[var(--shadow-node)]",
        hasErrors && "shadow-[0_0_0_2px_var(--danger-soft)]",
      )}
      aria-label={`${data.label}，${hasErrors ? `${data.validationCount} 个错误` : "配置正常"}`}
      >
      {data.operatorId !== "control.start" && <Handle type="target" position={Position.Left} className="workflow-handle" aria-label={`${data.label} 输入端口`} />}
      <div className="flex items-start gap-2.5 p-3 pb-2.5">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white/80", tone)}>
          {category ? <OperatorCategoryIcon category={category} className="h-4 w-4" /> : <ControlIcon className="h-4 w-4" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <Badge className={cn("h-5 max-w-[158px] truncate border text-[9px]", tone)}>{category ? getOperatorCategoryLabel(category) : data.operatorId === "control.start" ? "启动" : data.operatorId === "control.aggregate" ? "二路聚合" : data.kind === "result" ? "结束" : "控制"}</Badge>
            {hasErrors ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--danger)]"><AlertCircle className="h-3.5 w-3.5" />{data.validationCount}</span>
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)]" aria-label="配置完整" />
            )}
          </div>
          <h3 className="mt-1.5 truncate text-[13px] font-semibold leading-5 tracking-tight text-[var(--foreground)]" title={data.label}>{data.label}</h3>
          <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--muted-foreground)]" title={data.operatorId}>{data.operatorId}</p>
        </div>
      </div>
      <p className="line-clamp-2 min-h-8 px-3 text-[10px] leading-4 text-[var(--muted-foreground)]">{operator?.description}</p>
      {runState !== "idle" && (
        <div className={cn("mt-2 flex items-center justify-end border-t border-black/[0.06] px-3 py-2 text-[10px]", runTone)}>
          <span className="inline-flex max-w-[120px] items-center gap-1 font-medium">{runState === "running" ? <LoaderCircle className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : runState === "pending" ? <Clock3 className="h-3 w-3" /> : runState === "succeeded" ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}<span className="truncate">{data.runDetail || (runState === "running" ? "处理中" : runState === "pending" ? "等待回传" : runState === "succeeded" ? "已完成" : "失败")}</span></span>
        </div>
      )}
      {routes.length > 0 ? (
        <div className="border-t border-black/[0.06] bg-white/55 py-1">
          {routes.map((route) => {
            const connected = data.connectedRouteIds?.includes(route.id);
            return (
              <div key={route.id} className="relative flex h-8 items-center justify-between px-3 text-[10px]">
                <span className="font-semibold text-[var(--control-strong)]">{route.label}</span>
                <span className={cn("mr-1 text-[9px]", connected ? "text-[var(--success)]" : "text-[var(--muted-foreground)]")}>{connected ? "已连接" : "待连接"}</span>
                <Handle id={route.id} type="source" position={Position.Right} className="workflow-handle" aria-label={`${data.label} ${route.label} 出口`} />
              </div>
            );
          })}
        </div>
      ) : data.kind !== "result" ? <Handle type="source" position={Position.Right} className="workflow-handle" aria-label={`${data.label} 输出端口`} /> : null}
      </article>
      {data.kind !== "result" && routes.length === 0 && !data.flowLocked && Boolean(data.quickAddOperatorIds?.length) && (
        <div className="nodrag nopan absolute left-[calc(100%+16px)] top-1/2 z-30 -translate-y-1/2">
          <span className="pointer-events-none absolute right-full top-1/2 h-px w-4 -translate-y-1/2 bg-[var(--border-strong)]" aria-hidden="true" />
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-strong)] bg-white text-[var(--muted-foreground)] shadow-[0_2px_6px_oklch(0.235_0.025_255/0.10)] transition-colors hover:border-[var(--operator-border)] hover:bg-[var(--operator-soft)] hover:text-[var(--operator-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            aria-label={`在 ${data.label} 后添加节点`}
            aria-expanded={quickAddOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); setQuickAddOpen((open) => !open); }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {quickAddOpen && (
            <div className="absolute left-9 top-1/2 w-[250px] -translate-y-1/2 rounded-[10px] border border-[var(--border-strong)] bg-white p-1.5 shadow-[0_8px_16px_oklch(0.235_0.025_255/0.14)]" role="menu" aria-label="推荐的下一步">
              <p className="px-2 pb-1.5 pt-1 text-[10px] font-medium text-[var(--muted-foreground)]">推荐下一步</p>
              {(data.quickAddOperatorIds || []).map((operatorId, index) => {
                const option = getOperator(operatorId);
                if (!option) return null;
                const optionCategory = getOperatorCategory(option);
                return (
                  <button
                    type="button"
                    role="menuitem"
                    key={operatorId}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); data.onQuickAdd?.(id, operatorId); setQuickAddOpen(false); }}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", option.kind === "result" ? terminalNodeStyle : optionCategory ? getOperatorCategoryStyle(optionCategory) : controlNodeStyle)}>
                      {optionCategory ? <OperatorCategoryIcon category={optionCategory} className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-[var(--foreground)]">{option.name}</span><span className="block truncate font-mono text-[9px] text-[var(--muted-foreground)]">{option.id}</span></span>
                    {index === 0 && <span className="shrink-0 text-[9px] text-[var(--operator-strong)]">最匹配</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
