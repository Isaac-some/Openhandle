"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch, ListFilter, Shuffle, Split } from "lucide-react";
import { cn } from "@/app/lib/utils";

export function WorkflowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data, selected }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.38 });
  const mismatch = Boolean(data?.mismatch);
  const relationOperatorId = data?.relationOperatorId;
  const hasInlineStep = Boolean(relationOperatorId);
  const routeLabel = typeof data?.routeLabel === "string" ? data.routeLabel : undefined;
  const routeId = typeof data?.routeId === "string" ? data.routeId : undefined;
  const keepsRouteLabelVisible = Boolean(routeLabel) && !mismatch && !hasInlineStep;
  const inlineStep = relationOperatorId === "control.transform"
    ? { label: "字段映射", Icon: Shuffle }
    : relationOperatorId === "control.condition"
      ? { label: "条件分流", Icon: GitBranch }
      : relationOperatorId === "control.split"
        ? { label: "二路平均分片", Icon: Split }
        : null;
  const RouteIcon = routeId === "A" || routeId === "B" ? Split : routeId === "keep" || routeId === "discard" ? ListFilter : GitBranch;
  const statusIcon = mismatch ? AlertTriangle : inlineStep?.Icon || (routeLabel ? RouteIcon : undefined);
  const statusLabel = mismatch ? "字段不匹配" : inlineStep?.label || routeLabel;
  return (
    <>
      {mismatch && <path d={path} fill="none" className="workflow-edge-mismatch-glow" aria-hidden="true" />}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={30}
        className={cn(
          "workflow-edge-path",
          mismatch ? "workflow-edge-path--mismatch" : selected ? "workflow-edge-path--selected" : data?.invalid ? "workflow-edge-path--invalid" : "workflow-edge-path--default",
        )}
      />
      {(hasInlineStep || routeLabel || mismatch) && statusIcon && statusLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={cn(
              "nodrag nopan group pointer-events-auto absolute z-20 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center overflow-hidden rounded-full border bg-white px-1.5 shadow-[0_2px_6px_oklch(0.235_0.025_255/0.10)] transition-[max-width,border-color,background-color] duration-200 focus-visible:max-w-[260px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              mismatch ? "border-[var(--warning-border)] text-[var(--warning-strong)]" : "border-[var(--control-border)] text-[var(--control-strong)]",
              keepsRouteLabelVisible ? "max-w-[260px] px-2" : "max-w-7 hover:max-w-[260px]",
            )}
            data-edge-relation-label={hasInlineStep ? id : undefined}
            data-edge-route-label={routeLabel ? id : undefined}
            style={{ left: labelX, top: labelY }}
            aria-label={`${statusLabel}${Array.isArray(data?.fields) && data.fields.length ? `：${data.fields.join("，")}` : ""}`}
            onClick={(event) => event.stopPropagation()}
          >
            {(() => { const Icon = statusIcon; return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />; })()}
            <span className={cn("ml-1.5 whitespace-nowrap pr-1 text-[10px] font-semibold transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100", keepsRouteLabelVisible ? "opacity-100" : "opacity-0")}>{statusLabel}</span>
            {Array.isArray(data?.fields) && data.fields.length > 0 && <span className="whitespace-nowrap border-l border-current/15 pl-2 pr-1 font-mono text-[9px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">{data.fields.slice(0, 2).join(" · ")}</span>}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
