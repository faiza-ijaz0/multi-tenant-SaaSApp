import Link from "next/link";

import { ActivityTimeline, type TimelineItem } from "@/components/analytics/activity-timeline";
import { Card, CardContent } from "@/components/ui/card";

import { describeAuditActor, describeAuditEvent, timelineAccentForAuditEvent, type AuditEvent } from "./queries";

/**
 * Admin/owner-only, matching audit_events_select_admin -- callers must
 * only render this after their own role check (see
 * app/dashboard/page.tsx), same requirement as app/dashboard/activity/page.tsx.
 * A compact preview of the full activity log, not a replacement for it.
 *
 * Renders through the same ActivityTimeline used by the full Activity page
 * (components/analytics/activity-timeline.tsx) rather than a second,
 * drifting list layout -- one premium timeline visual language for "what
 * happened" everywhere it appears in the app.
 */
export function RecentActivityCard({
  events,
  currentUserId,
  actorNames,
}: {
  events: AuditEvent[];
  currentUserId: string;
  actorNames?: Map<string, string>;
}) {
  if (events.length === 0) return null;

  const items: TimelineItem[] = events.map((event) => ({
    id: event.id,
    title: (
      <>
        <span className="font-medium">{describeAuditActor(event.actorProfileId, currentUserId, actorNames)}</span>{" "}
        {describeAuditEvent(event)}
      </>
    ),
    timestamp: event.createdAt,
    accent: timelineAccentForAuditEvent(event.action),
  }));

  return (
    <Card className="h-full">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <p className="text-xs text-muted-foreground">Privileged actions across your organization.</p>
          </div>
          <Link href="/dashboard/activity" className="shrink-0 text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <ActivityTimeline items={items} />
      </CardContent>
    </Card>
  );
}
