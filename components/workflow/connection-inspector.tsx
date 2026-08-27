"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/app/lib/utils";
import { getConnectionStatusForFields, getEdgeFieldPair, getOperator, type BuilderEdge, type BuilderNode, type OperatorField } from "@/app/lib/workflow";

interface ConnectionInspectorProps {
  edge: BuilderEdge;
  source: BuilderNode;
  sourceFields: OperatorField[];
  target: BuilderNode;
  onClose: () => void;
  onDelete: () => void;
  onSetFields: (edgeId: string, sourceField: string, targetField: string) => void;
}

export function ConnectionInspector({ edge, source, sourceFields, target, onClose, onDelete, onSetFields }: ConnectionInspectorProps) {
  const targetOperator = getOperator(target.data.operatorId);
  const isAggregateInput = targetOperator?.id === "control.aggregate";
  const isEndEdge = targetOperator?.id === "control.result";
  const isStartEdge = source.data.operatorId === "control.start";
  const isTopologyEdge = isAggregateInput || isStartEdge || isEndEdge;
  const pair = getEdgeFieldPair(edge);
  const sourceField = pair.sourceField || sourceFields[0]?.key || "";
  const targetField = pair.targetField || targetOperator?.inputs[0]?.key || "";
  const status = getConnectionStatusForFields(sourceFields, targetOperator, sourceField, targetField);

  const update = (nextSource: string, nextTarget: string) => {
    if (nextSource && nextTarget) onSetFields(edge.id, nextSource, nextTarget);
  };

  return (
    <motion.aside initial={{ x: 28, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="flex h-full min-w-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]" aria-label="连接字段抽屉">
      <div className="border-b border-[var(--border)] bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="border-[oklch(0.80_0.08_255)] bg-[oklch(0.97_0.018_255)] text-[oklch(0.42_0.10_255)]">{isAggregateInput ? "二路聚合线路" : isStartEdge ? "启动线路" : isEndEdge ? "结束线路" : "字段连接"}</Badge>
              {edge.data?.routeLabel && <Badge className="border-[var(--control-border)] bg-[var(--control-soft)] text-[var(--control-strong)]">出口 {String(edge.data.routeLabel)}</Badge>}
              {!isTopologyEdge && <Badge className={cn(status.compatible ? "border-[oklch(0.78_0.10_155)] bg-[oklch(0.96_0.035_155)] text-[var(--success)]" : "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-strong)]")}>{status.compatible ? "字段匹配" : "字段不匹配"}</Badge>}
            </div>
            <h2 className="mt-2 text-sm font-semibold">{isAggregateInput ? "核对二路聚合线路" : isStartEdge ? "工作流入口" : isEndEdge ? "核对最终结局" : "核对连接字段"}</h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{isAggregateInput ? "两条线路的全部字段必须完全一致。" : isStartEdge ? "启动节点只定义执行顺序，不传递业务字段。" : isEndEdge ? "结束节点可接收多条线路，但不会将数据聚合后继续处理。" : "明确选择这条连线传递的出参与入参。"}</p>
          </div>
          <div className="flex items-center gap-1"><Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label="删除连线"><Trash2 className="h-4 w-4" /></Button><Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="关闭连接字段抽屉"><X className="h-4 w-4" /></Button></div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <h3 className="text-xs font-semibold">当前路径</h3>
        <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
          <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{source.data.label}</p><p className="mt-0.5 truncate font-mono text-[9px] text-[var(--muted-foreground)]">{source.data.operatorId}</p></div>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--connection)]" />
          <div className="min-w-0 flex-1 text-right"><p className="truncate text-xs font-semibold">{target.data.label}</p><p className="mt-0.5 truncate font-mono text-[9px] text-[var(--muted-foreground)]">{target.data.operatorId}</p></div>
        </div>

        {!isTopologyEdge && <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <label className="min-w-0 text-[10px] font-medium text-[var(--muted-foreground)]">出参
            <select value={sourceField} onChange={(event) => update(event.target.value, targetField)} className="mt-1 h-9 w-full rounded-lg border border-[var(--border-strong)] bg-white px-2 font-mono text-[10px] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]">{sourceFields.map((field) => <option key={field.key} value={field.key}>{field.key} · {field.type}{field.cardinality === "many" ? "[]" : ""}</option>)}</select>
          </label>
          <ArrowRight className="mb-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <label className="min-w-0 text-[10px] font-medium text-[var(--muted-foreground)]">入参
            <select value={targetField} onChange={(event) => update(sourceField, event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[var(--border-strong)] bg-white px-2 font-mono text-[10px] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]">{targetOperator?.inputs.map((field) => <option key={field.key} value={field.key}>{field.key} · {field.type}{field.cardinality === "many" ? "[]" : ""}</option>)}</select>
          </label>
        </div>}

        <div className={cn("mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5", isTopologyEdge || status.compatible ? "border-[oklch(0.82_0.07_155)] bg-[oklch(0.97_0.02_155)] text-[oklch(0.40_0.12_155)]" : "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning-strong)]")}>
          {isTopologyEdge || status.compatible ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <p className="text-[11px] leading-4">{isAggregateInput ? `该线路当前携带 ${sourceFields.length} 个字段；接入第二条线路时会逐项校验。` : isStartEdge ? "该连线确定工作流启动后的第一个节点。" : isEndEdge ? "该线路的每条数据都会按结束节点配置记录结局。" : status.reason}</p>
        </div>
      </div>
    </motion.aside>
  );
}
