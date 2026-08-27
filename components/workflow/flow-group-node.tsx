"use client";

import { LockKeyhole, LockKeyholeOpen, Workflow } from "lucide-react";
import type { NodeProps } from "@xyflow/react";
import type { BuilderNode } from "@/app/lib/workflow";

export function FlowGroupNode({ id, data }: NodeProps<BuilderNode>) {
  return (
    <section className="relative h-full w-full rounded-[12px] border border-dashed border-[var(--flow-border)] bg-[var(--flow-surface)]" aria-label={`Flow ${data.label}，已锁定为节点组`}>
      <div className="drag-handle absolute inset-x-0 top-0 flex h-11 items-center justify-between border-b border-dashed border-[var(--flow-border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[var(--muted-foreground)]"><Workflow className="h-3.5 w-3.5" aria-hidden="true" /></span>
          <span className="truncate text-[11px] font-semibold text-[var(--foreground)]">{data.label}</span>
          <span className="font-mono text-[9px] text-[var(--muted-foreground)]">{data.flowVersion}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[9px] text-[var(--muted-foreground)]"><LockKeyhole className="h-3 w-3" aria-hidden="true" />组已锁定</span>
          <button
            type="button"
            className="nodrag nopan inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--border-strong)] bg-white px-2 text-[10px] font-medium text-[var(--foreground)] hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            onClick={(event) => { event.stopPropagation(); data.onUnlockFlow?.(id); }}
          >
            <LockKeyholeOpen className="h-3 w-3" aria-hidden="true" />
            解锁
          </button>
        </div>
      </div>
    </section>
  );
}
