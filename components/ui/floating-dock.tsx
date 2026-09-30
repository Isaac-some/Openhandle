"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useRef, type ReactNode } from "react";

export type DockItem = { title: string; icon: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; separator?: boolean; className?: string };
export function FloatingDock({ items, className = "" }: { items: DockItem[]; className?: string }) {
  const mouseX = useMotionValue(Infinity);
  return <nav aria-label="画布工具" className={`p2-canvas-toolbar p2-floating-dock ${className}`} onPointerMove={(event) => mouseX.set(event.clientX)} onPointerLeave={() => mouseX.set(Infinity)}>
    {items.map((item) => <DockButton key={item.title} item={item} mouseX={mouseX} />)}
  </nav>;
}
function DockButton({ item, mouseX }: { item: DockItem; mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const distance = useTransform(mouseX, (x) => { const bounds = ref.current?.getBoundingClientRect(); return bounds ? x - bounds.x - bounds.width / 2 : Infinity; });
  const magnification = useTransform(distance, [-90, 0, 90], [1, 1.28, 1]);
  const scale = useSpring(magnification, { mass: 0.1, stiffness: 180, damping: 18 });
  return <>{item.separator && <i aria-hidden="true" />}<div ref={ref} className="p2-dock-item"><motion.button type="button" aria-label={item.title} aria-pressed={item.active === undefined ? undefined : item.active} disabled={item.disabled} onClick={item.onClick} style={{ scale: reduced || item.disabled ? 1 : scale }} className={`${item.className ?? ""} ${item.active ? "active" : ""}`}>
    {item.icon}{item.className === "p2-toolbar-add" && <span>添加节点</span>}
  </motion.button><span className="p2-tool-tooltip" role="tooltip">{item.title}</span></div></>;
}
