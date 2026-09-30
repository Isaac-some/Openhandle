"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Layers, Search } from "lucide-react";

export type SourceOption = { value: string; nodeId: string; nodeLabel: string; field: string; type: string; compatible: boolean };
export function SourcePicker({ id, value, options, disabled, onChange, onPreview }: {
  id: string; value: string; options: SourceOption[]; disabled?: boolean;
  onChange: (value: string) => void; onPreview: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState({ top: 0, left: 0, width: 320, maxHeight: 360 });
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => `${option.nodeLabel} ${option.field}`.toLowerCase().includes(query.toLowerCase()));
  const close = () => { setOpen(false); onPreview(null); };
  const show = () => {
    const bounds = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom - 16;
    const height = Math.min(360, Math.max(below, bounds.top - 16));
    setRect({ top: below >= 240 ? bounds.bottom + 6 : Math.max(8, bounds.top - height - 6), left: Math.max(8, Math.min(bounds.left, window.innerWidth - Math.max(bounds.width, 320) - 8)), width: Math.max(bounds.width, 320), maxHeight: height });
    setQuery(""); setCursor(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(true); onPreview(selected?.nodeId ?? null);
  };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) { setOpen(false); onPreview(null); } };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, onPreview]);
  const commit = (next: string) => { onChange(next); close(); trigger.current?.focus(); };
  const groups = [...new Set(filtered.map((option) => option.nodeId))];
  return <><button ref={trigger} id={id} type="button" className={`p2-source-trigger ${value && !selected && value !== "fixed" ? "invalid" : ""}`} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => open ? close() : show()}>
    <span>{selected ? <><Layers size={14} /><strong>{selected.nodeLabel}</strong><span className="p2-source-divider">输出字段</span><code>{selected.field}</code></> : value === "fixed" ? "固定值" : value ? "来源已失效 · 请重新选择" : "选择上游节点的输出字段"}</span><ChevronDown size={15} />
  </button>{open && createPortal(<div ref={menu} className="p2-source-menu" style={rect} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); const next = (cursor + (event.key === "ArrowDown" ? 1 : -1) + filtered.length + 1) % (filtered.length + 1); setCursor(next); onPreview(filtered[next]?.nodeId ?? null); document.getElementById(`${id}-option-${next}`)?.scrollIntoView({ block: "nearest" }); }
    if (event.key === "Enter") { event.preventDefault(); commit(filtered[cursor]?.value ?? "fixed"); }
    if (event.key === "Tab") close();
  }}><div className="p2-source-menu-search"><Search size={15} /><input autoFocus aria-label="搜索上游节点或字段" aria-controls={`${id}-options`} aria-activedescendant={`${id}-option-${cursor}`} role="combobox" aria-expanded placeholder="搜索节点名称或输出字段" value={query} onChange={(event) => { setQuery(event.target.value); setCursor(0); onPreview(null); }} /></div><p>指向选项时，左侧画布会标出来源节点</p><div className="p2-source-options" role="listbox" aria-label="输入来源" id={`${id}-options`}>
    {groups.map((nodeId) => <div key={nodeId} className="p2-source-group"><h4><Layers size={13} />来自「{filtered.find((option) => option.nodeId === nodeId)!.nodeLabel}」</h4>{filtered.filter((option) => option.nodeId === nodeId).map((option) => { const index = filtered.indexOf(option); return <button type="button" role="option" tabIndex={-1} aria-selected={option.value === value} className={cursor === index ? "highlighted" : ""} id={`${id}-option-${index}`} key={option.value} onPointerEnter={() => { setCursor(index); onPreview(option.nodeId); }} onClick={() => commit(option.value)}><code>{option.field}</code><small>{option.type}{option.compatible ? "" : " · 需转换"}</small>{option.value === value && <Check size={14} />}</button>; })}</div>)}
    {!filtered.length && <p>没有匹配的上游字段</p>}<button type="button" role="option" aria-selected={value === "fixed"} tabIndex={-1} className={cursor === filtered.length ? "highlighted" : ""} id={`${id}-option-${filtered.length}`} onPointerEnter={() => { setCursor(filtered.length); onPreview(null); }} onClick={() => commit("fixed")}>使用固定值{value === "fixed" && <Check size={14} />}</button>
  </div></div>, document.body)}</>;
}
