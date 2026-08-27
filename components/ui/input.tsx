import * as React from "react";
import { cn } from "@/app/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-9 w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus-soft)] disabled:cursor-not-allowed disabled:bg-[var(--surface)] disabled:text-[var(--muted-foreground)]", className)} {...props} />
));
Input.displayName = "Input";
