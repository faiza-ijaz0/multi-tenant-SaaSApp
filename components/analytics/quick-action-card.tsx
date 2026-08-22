import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

type QuickActionAccent = "primary" | "sky" | "warning" | "info" | "success";

const ICON_CLASSNAMES: Record<QuickActionAccent, string> = {
  primary: "bg-gradient-to-br from-primary/18 to-primary/5 text-primary ring-1 ring-primary/15",
  sky: "bg-gradient-to-br from-sky/22 to-sky/5 text-sky ring-1 ring-sky/20",
  warning: "bg-gradient-to-br from-warning/18 to-warning/5 text-warning ring-1 ring-warning/15",
  info: "bg-gradient-to-br from-info/18 to-info/5 text-info ring-1 ring-info/15",
  success: "bg-gradient-to-br from-success/18 to-success/5 text-success ring-1 ring-success/15",
};

const HOVER_BORDER_CLASSNAMES: Record<QuickActionAccent, string> = {
  primary: "hover:border-primary/30",
  sky: "hover:border-sky/35",
  warning: "hover:border-warning/30",
  info: "hover:border-info/30",
  success: "hover:border-success/30",
};

const HOVER_WASH_CLASSNAMES: Record<QuickActionAccent, string> = {
  primary: "from-primary/[0.06]",
  sky: "from-sky/[0.08]",
  warning: "from-warning/[0.06]",
  info: "from-info/[0.06]",
  success: "from-success/[0.06]",
};

/**
 * A single Quick Actions entry. The caller is entirely responsible for
 * only rendering one when the viewer actually holds the relevant page/
 * action permission (see app/dashboard/page.tsx) -- this component has no
 * authorization logic and never decides its own visibility, so there is
 * never a dead-end button a viewer can't actually use.
 *
 * `accent` gives each action its own identity within the existing
 * purple/sky/gold/blue/green palette (never a one-off color) so a row of
 * these doesn't read as five identical grey buttons -- defaults to the
 * brand primary when the caller doesn't specify one.
 */
export function QuickActionCard({
  label,
  description,
  href,
  icon,
  accent = "primary",
}: {
  label: string;
  description: string;
  href: string;
  icon: ReactNode;
  accent?: QuickActionAccent;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/70 bg-card p-3.5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-px hover:shadow-md",
        HOVER_BORDER_CLASSNAMES[accent],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100",
          HOVER_WASH_CLASSNAMES[accent],
        )}
      />
      <span
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105",
          ICON_CLASSNAMES[accent],
        )}
      >
        {icon}
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight
        className="relative size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
