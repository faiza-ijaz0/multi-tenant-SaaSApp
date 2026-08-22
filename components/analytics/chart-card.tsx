import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared Card shell for every chart on the analytics pages -- title +
 * optional filter control in the header row, then either the real chart
 * (passed as `children`, already rendered against real data by the
 * caller) or `emptyState` when there's nothing to plot. A plain Server
 * Component: the chart itself (children) is the only client-interactive
 * piece, composed in via ordinary JSX, not prop-drilled data.
 *
 * `variant="hero"` is the dashboard's single dominant analytics surface
 * (app/dashboard/page.tsx's "Submission trends") -- a stronger title, a
 * small accent marker, and a slightly elevated shadow so it visually reads
 * as the primary chart, with every other chart on the page composed as
 * `variant="default"` (the un-elevated norm) in support of it.
 */
export function ChartCard({
  title,
  description,
  filter,
  isEmpty,
  emptyState,
  children,
  variant = "default",
}: {
  title: string;
  description?: string;
  filter?: ReactNode;
  isEmpty?: boolean;
  emptyState?: ReactNode;
  children: ReactNode;
  variant?: "default" | "hero";
}) {
  return (
    <Card
      className={cn(
        "transition-shadow duration-200",
        variant === "hero" &&
          "border-primary/12 shadow-[0_4px_28px_-10px_hsl(var(--shadow-color)/0.22)] ring-1 ring-primary/5",
      )}
    >
      <CardContent className={cn("space-y-4", variant === "hero" && "sm:space-y-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {variant === "hero" ? (
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
              ) : null}
              <h3
                className={cn(
                  "font-semibold text-foreground",
                  variant === "hero" ? "text-base sm:text-lg" : "text-sm",
                )}
              >
                {title}
              </h3>
            </div>
            {description ? (
              <p className={cn("text-muted-foreground", variant === "hero" ? "text-xs sm:text-sm" : "text-xs")}>
                {description}
              </p>
            ) : null}
          </div>
          {filter}
        </div>
        {isEmpty ? emptyState : children}
      </CardContent>
    </Card>
  );
}
