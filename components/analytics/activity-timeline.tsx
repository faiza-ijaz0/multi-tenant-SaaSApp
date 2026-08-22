import type { ReactNode } from "react";
import { Building2, Inbox, KeyRound, ShieldCheck, UserPlus } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: ReactNode;
  timestamp: string;
  /** Defaults to a generic activity dot when omitted. */
  icon?: ReactNode;
  /**
   * Semantic event-type coloring -- primary (organization-level events),
   * success (member lifecycle: joined/created/removed/updated/password),
   * warning (role/permission/ownership changes -- the most sensitive
   * category), sky (submission/status events), info (invitations). See
   * features/audit/queries.ts's timelineAccentForAuditEvent, the single
   * source of truth mapping a real audit_events `action` string to one of
   * these -- never invented per call site.
   */
  accent?: "primary" | "success" | "info" | "warning" | "sky";
}

const DEFAULT_ICONS: Record<NonNullable<TimelineItem["accent"]>, ReactNode> = {
  primary: <Building2 className="size-3" aria-hidden="true" />,
  success: <UserPlus className="size-3" aria-hidden="true" />,
  info: <KeyRound className="size-3" aria-hidden="true" />,
  warning: <ShieldCheck className="size-3" aria-hidden="true" />,
  sky: <Inbox className="size-3" aria-hidden="true" />,
};

const ACCENT_CLASSNAMES: Record<NonNullable<TimelineItem["accent"]>, string> = {
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
  sky: "bg-sky/20 text-sky",
};

/**
 * Shared vertical timeline -- generalized from the Activity page's
 * original inline JSX. Used both for the plain admin-action feed
 * (listAuditEvents) and the merged organization-lifecycle view
 * (features/audit/lifecycle.ts's buildLifecycleTimeline); the caller
 * supplies already-real, already-authorized data -- this component has no
 * data fetching or authorization logic of its own.
 */
export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="space-y-0">
      {items.map((item, index) => (
        <div key={item.id} className="group relative flex gap-3 pb-4 last:pb-0">
          {index < items.length - 1 ? (
            <span className="absolute top-6 left-[11px] h-full w-px bg-border" aria-hidden="true" />
          ) : null}
          <span
            className={cn(
              "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-background transition-transform duration-150 group-hover:scale-105",
              ACCENT_CLASSNAMES[item.accent ?? "primary"],
            )}
          >
            {item.icon ?? DEFAULT_ICONS[item.accent ?? "primary"]}
          </span>
          <div className="min-w-0 flex-1 rounded-lg px-1.5 py-0.5 pt-0.5 transition-colors duration-150 group-hover:bg-muted/40">
            <p className="text-sm text-foreground">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(item.timestamp)} UTC</p>
          </div>
        </div>
      ))}
    </div>
  );
}
