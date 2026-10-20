import * as React from "react";
import { cn } from "@/app/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("rounded-xl border border-[var(--border)] bg-white", className)} {...props} />);
Card.displayName = "Card";
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => <div ref={ref} className={cn("p-4", className)} {...props} />);
CardContent.displayName = "CardContent";
