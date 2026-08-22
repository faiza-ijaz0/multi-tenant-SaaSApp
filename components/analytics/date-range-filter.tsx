import Link from "next/link";

import { cn } from "@/lib/utils";
import { CHART_RANGE_OPTIONS, type ChartRange } from "@/lib/analytics/time-ranges";

/**
 * Plain server-rendered segmented control -- the active range is driven
 * entirely by a URL search param (same pattern already established on
 * /dashboard/submissions's filter form: real navigation, no client fetch
 * waterfall, no lost state on refresh/share). `basePath` lets the same
 * component be reused across pages with different query-string shapes
 * (e.g. carrying other active filters through untouched).
 */
export function DateRangeFilter({
  basePath,
  active,
  paramName = "range",
  extraParams,
}: {
  basePath: string;
  active: ChartRange;
  paramName?: string;
  extraParams?: Record<string, string>;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Date range">
      {CHART_RANGE_OPTIONS.map((option) => {
        const params = new URLSearchParams(extraParams);
        params.set(paramName, option.value);
        const href = `${basePath}?${params.toString()}`;
        const isActive = option.value === active;
        return (
          <Link
            key={option.value}
            href={href}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-[calc(var(--radius-md)-2px)] px-2.5 py-1 text-xs font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
