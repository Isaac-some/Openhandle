import { X } from "lucide-react";
import { NodeReferenceGlyph } from "./node-reference-icon";
import { resolveNodeReference, type NodeReference, type NodeReferenceContext } from "./node-reference";

export function NodeReferenceView({ reference, context, liveNodeIds, hideIcon, onFocus, onNotice, onRemove }: {
  reference: NodeReference; context: NodeReferenceContext; liveNodeIds: string[]; hideIcon: boolean;
  onFocus: (id: string) => void; onNotice: (message: string) => void; onRemove?: () => void;
}) {
  const resolved = resolveNodeReference(reference, context, liveNodeIds);
  const nodeLabel = resolved.node?.label ?? reference.label;
  const label = reference.field ? `${reference.field.direction === "csv" ? "CSV" : nodeLabel} · ${reference.field.direction === "inputs" ? "输入 " : reference.field.direction === "outputs" ? "输出 " : ""}${reference.field.path}` : nodeLabel;
  const icon = resolved.node ? resolved.node.icon : reference.icon;
  return <span className={`p2-node-ref ${resolved.valid ? "" : "invalid"}`} data-node-id={reference.nodeId} data-reference-status={resolved.valid ? "valid" : "invalid"} data-has-icon={Boolean(icon && !hideIcon)}>
    <a href={`#node-${encodeURIComponent(reference.nodeId)}`} aria-label={`${label} 节点引用`} title={`${label} · 节点 ID：${reference.nodeId} · 工作流：${reference.workflowId} · 快照 ${reference.revision}${resolved.reason ? ` · ${resolved.reason}` : ""}`} onClick={(event) => { event.preventDefault(); if (resolved.valid) onFocus(reference.nodeId); else onNotice(resolved.reason); }}>
      {!hideIcon && <NodeReferenceGlyph icon={icon} />}<span>{label}</span>
    </a>
    {onRemove && <button type="button" aria-label={`移除引用 ${label}`} onClick={onRemove}><X size={12} /></button>}
  </span>;
}
