import type { ReactNode } from "react";
import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Real week-over-week (or any current/prior pair) comparison only -- never
 * rendered when there's no prior data point to compare against, so this
 * never implies a trend that isn't backed by two real numbers. Generalized
 * from features/submissions/dashboard-stats.tsx's original WeekTrend
 * (kept there is now just a thin call into this).
 */
export function TrendIndicator({ current, prior, unit }: { current: number; prior: number; unit?: string }) {
  if (prior === 0 && current === 0) return null;

  const delta = current - prior;
  if (delta === 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        <span className="sr-only">No change{unit ? ` ${unit}` : ""}</span>
      </span>
    );
  }

  const isUp = delta > 0;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium tabular-nums",
        isUp ? "text-success" : "text-muted-foreground",
      )}
    >
      {isUp ? <TrendingUp className="size-3" aria-hidden="true" /> : <TrendingDown className="size-3" aria-hidden="true" />}
      {isUp ? "+" : ""}
      {delta}
      {unit ? <span className="sr-only"> {unit}</span> : null}
    </span>
  );
}

export interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  href?: string;
  /** e.g. "+12 this month" -- a real, precomputed delta line, never a raw percentage guess. */
  meta?: ReactNode;
  trend?: ReactNode;
  /** Owner-brand tint for the icon container -- default is the neutral primary tint. */
  accent?: "primary" | "success" | "warning" | "info" | "destructive" | "sky";
}

const ACCENT_CLASSNAMES: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15",
  success: "bg-gradient-to-br from-success/20 to-success/5 text-success ring-1 ring-success/15",
  warning: "bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-1 ring-warning/15",
  info: "bg-gradient-to-br from-info/20 to-info/5 text-info ring-1 ring-info/15",
  destructive: "bg-gradient-to-br from-destructive/20 to-destructive/5 text-destructive ring-1 ring-destructive/15",
  sky: "bg-gradient-to-br from-sky/20 to-sky/5 text-sky ring-1 ring-sky/15",
};

/** The soft blurred corner glow behind the icon -- a whisper of the accent
 * color, not a decoration that competes with the number. */
const ACCENT_GLOW: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-primary/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
  info: "bg-info/15",
  destructive: "bg-destructive/15",
  sky: "bg-sky/20",
};

const ACCENT_HOVER_RING: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "group-hover:ring-primary/25",
  success: "group-hover:ring-success/25",
  warning: "group-hover:ring-warning/25",
  info: "group-hover:ring-info/25",
  destructive: "group-hover:ring-destructive/25",
  sky: "group-hover:ring-sky/30",
};

/**
 * The one shared KPI card used across /dashboard, /dashboard/activity,
 * /dashboard/categories, /dashboard/statuses, /dashboard/role-management,
 * and /dashboard/settings/organization/members -- generalized from the
 * pre-existing StatCard (dashboard-stats.tsx) and SummaryStat
 * (role-management/page.tsx), which both did the same thing slightly
 * differently. `value` and every number in `meta`/`trend` must always be a
 * real, already-computed number from the caller's own query -- this
 * component never computes or fabricates anything itself.
 */
export function StatCard({ label, value, icon, href, meta, trend, accent = "primary" }: StatCardProps) {
  const body = (
    <Card
      className={cn(
        "relative h-full ring-1 ring-transparent transition-all duration-200",
        href && "group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_24px_-8px_hsl(var(--shadow-color)/0.22)]",
        href && ACCENT_HOVER_RING[accent],
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-8 -right-8 size-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          ACCENT_GLOW[accent],
        )}
      />
      <CardContent className="relative flex items-start gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200",
            href && "group-hover:scale-105",
            ACCENT_CLASSNAMES[accent],
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className="text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums text-foreground">{value}</p>
            {trend}
          </div>
          <p className="mt-1.5 truncate text-xs font-medium text-muted-foreground">{label}</p>
          {meta ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">{meta}</p> : null}
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="group block">
      {body}
    </Link>
  ) : (
    body
  );
}
