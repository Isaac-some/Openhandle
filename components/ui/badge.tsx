import type { HTMLAttributes } from "react";
import { cn } from "@/app/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex h-5 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[11px] font-medium leading-none text-[var(--muted-foreground)]", className)} {...props} />;
}
