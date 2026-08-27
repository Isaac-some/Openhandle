import * as React from "react";
import { cn } from "@/app/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("min-h-20 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--placeholder)] focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus-soft)]", className)} {...props} />
));
Textarea.displayName = "Textarea";
