"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/app/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, ...props }: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[oklch(0.18_0.02_255/0.28)] data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none" />
      <DialogPrimitive.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-white p-6 shadow-[0_16px_48px_oklch(0.2_0.02_255/0.18)] outline-none data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none", className)} {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label="关闭">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.DialogTitleProps) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold text-[var(--foreground)]", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.DialogDescriptionProps) {
  return <DialogPrimitive.Description className={cn("mt-1 text-sm leading-6 text-[var(--muted-foreground)]", className)} {...props} />;
}
