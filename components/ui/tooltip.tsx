"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/app/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: TooltipPrimitive.TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={sideOffset} className={cn("z-[60] rounded-md bg-[var(--foreground)] px-2 py-1.5 text-xs text-white shadow-sm motion-reduce:transition-none", className)} {...props} />
    </TooltipPrimitive.Portal>
  );
}
