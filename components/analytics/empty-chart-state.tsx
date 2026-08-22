import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";

/**
 * Shown instead of an empty/zero chart -- charts with no real data are
 * confusing (an empty axis grid looks broken), a clear message with an
 * optional next step is honest and useful. `action` is only ever rendered
 * when the caller has already checked the viewer holds the relevant
 * permission (e.g. submissions:create) -- this component has no
 * authorization logic of its own.
 */
export function EmptyChartState({
  title = "No data yet",
  description,
  action,
  height = 220,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  height?: number;
}) {
  return (
    <div
      style={{ height }}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <BarChart3 className="size-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-xs text-xs text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}
