import { HardDrive, ListFilter, ListPlus, Shuffle } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { operatorCategoryLabels, type OperatorCategory } from "@/app/lib/workflow";

const categoryStyles: Record<OperatorCategory, string> = {
  enrich: "border-[var(--operator-border)] bg-[var(--operator-soft)] text-[var(--operator-strong)]",
  filter: "border-[var(--operator-border)] bg-[var(--operator-soft)] text-[var(--operator-strong)]",
  transform: "border-[var(--operator-border)] bg-[var(--operator-soft)] text-[var(--operator-strong)]",
  io: "border-[var(--operator-border)] bg-[var(--operator-soft)] text-[var(--operator-strong)]",
};

export const controlNodeStyle = "border-[var(--control-border)] bg-[var(--control-soft)] text-[var(--control-strong)]";
export const terminalNodeStyle = "border-[var(--terminal-border)] bg-[var(--terminal-soft)] text-[var(--terminal-strong)]";

const categoryIcons = {
  enrich: ListPlus,
  filter: ListFilter,
  transform: Shuffle,
  io: HardDrive,
};

export function OperatorCategoryIcon({ category, className }: { category: OperatorCategory; className?: string }) {
  const Icon = categoryIcons[category];
  return <Icon className={className} aria-hidden="true" />;
}

export function getOperatorCategoryStyle(category: OperatorCategory, className?: string) {
  return cn(categoryStyles[category], className);
}

export function getOperatorCategoryLabel(category: OperatorCategory) {
  return operatorCategoryLabels[category];
}
