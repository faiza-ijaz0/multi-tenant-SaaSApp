import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-primary/10">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="max-w-sm text-sm text-muted-foreground/90">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
