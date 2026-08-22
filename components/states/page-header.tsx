import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** A short label above the title (e.g. "Workspace", "Customer portal") --
   * optional, and deliberately not used on every page: only where it adds
   * real orientation, not as decoration. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary/80 uppercase">
            <span aria-hidden="true" className="size-1 rounded-full bg-primary/70" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground/90">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
