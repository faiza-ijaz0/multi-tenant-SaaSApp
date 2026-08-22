import Link from "next/link";
import { Bell, CheckCircle2, CircleDot, Clock } from "lucide-react";

import { StatCard, TrendIndicator } from "@/components/analytics/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

import { StatusDonutChart } from "./status-donut-chart";
import type { SubmissionStats, SubmissionSummary } from "./queries";

function RecentSubmissionRow({
  submission,
  canOpenSubmissions,
}: {
  submission: SubmissionSummary;
  canOpenSubmissions: boolean;
}) {
  const content = (
    <>
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset ring-current/15 transition-transform duration-200 group-hover:scale-105"
        style={{ backgroundColor: `${submission.statusColor}1a`, color: submission.statusColor }}
        aria-hidden="true"
      >
        {submission.type === "bug" ? "B" : "F"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{submission.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {submission.categoryName ?? "Uncategorized"} · {formatDate(submission.createdAt)}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
        {submission.voteCount} {submission.voteCount === 1 ? "vote" : "votes"}
      </span>
    </>
  );

  // Only a real, reachable link when the viewer actually holds the
  // `submissions` page permission -- otherwise /dashboard/submissions/[id]
  // would 404 them. A Dashboard-only viewer still sees the same summary
  // info, just not as a dead-end link.
  if (!canOpenSubmissions) {
    return <div className="flex items-center gap-3 rounded-lg px-2 py-2">{content}</div>;
  }

  return (
    <Link
      href={`/dashboard/submissions/${submission.id}`}
      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-muted/50"
    >
      {content}
    </Link>
  );
}

/**
 * The secondary submissions strip below the dashboard's primary KPI row
 * (app/dashboard/page.tsx already shows a "Total submissions" StatCard, so
 * this deliberately does not repeat it) -- Open/Resolved/New-this-week/
 * Unread-notifications. Reuses the shared StatCard/TrendIndicator
 * (components/analytics/stat-card.tsx) rather than a second local copy.
 */
export function SubmissionSecondaryStats({
  stats,
  unreadNotifications,
  canOpenSubmissions,
}: {
  stats: SubmissionStats;
  unreadNotifications: number;
  canOpenSubmissions: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Open"
        value={stats.open}
        icon={<CircleDot className="size-4" aria-hidden="true" />}
        href={canOpenSubmissions ? "/dashboard/submissions?isClosed=false" : undefined}
      />
      <StatCard
        label="Resolved"
        value={stats.resolved}
        icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        accent="success"
        href={canOpenSubmissions ? "/dashboard/submissions?isClosed=true" : undefined}
      />
      <StatCard
        label="New this week"
        value={stats.newThisWeek}
        icon={<Clock className="size-4" aria-hidden="true" />}
        accent="sky"
        trend={<TrendIndicator current={stats.newThisWeek} prior={stats.newPriorWeek} unit="vs. prior week" />}
      />
      <StatCard
        label="Unread notifications"
        value={unreadNotifications}
        icon={<Bell className="size-4" aria-hidden="true" />}
        accent="warning"
      />
    </div>
  );
}

/**
 * Status-breakdown donut + legend -- the "how is work distributed across
 * statuses" insight that sits alongside the category-distribution chart in
 * the dashboard's MAIN analytics section. Renders nothing when every
 * status is at zero (the caller checks `stats.byStatus` before mounting
 * this, same empty-data discipline as every other analytics card here).
 */
export function StatusBreakdownCard({
  stats,
  canOpenSubmissions,
}: {
  stats: SubmissionStats;
  canOpenSubmissions: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="flex h-full items-center gap-6">
        <StatusDonutChart segments={stats.byStatus} total={stats.total} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Status breakdown</h2>
            <p className="text-xs text-muted-foreground">Where open work currently stands.</p>
          </div>
          <div className="space-y-1 pt-1">
            {stats.byStatus.map((status) => {
              const row = (
                <>
                  <span
                    className="size-2 shrink-0 rounded-full ring-2 ring-current/15"
                    style={{ backgroundColor: status.color, color: status.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{status.name}</span>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {status.count}
                  </span>
                </>
              );
              return canOpenSubmissions ? (
                <Link
                  key={status.statusId}
                  href={`/dashboard/submissions?statusId=${status.statusId}`}
                  className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-muted/50"
                >
                  {row}
                </Link>
              ) : (
                <div key={status.statusId} className="flex items-center gap-2 rounded-md px-1 py-1">
                  {row}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The dashboard's "Recent submissions" preview -- BOTTOM section, paired
 * with RecentActivityCard (features/audit/recent-activity-card.tsx). Each
 * row deep-links into /dashboard/submissions/[id] only when the viewer
 * holds the `submissions` page permission, never a dead-end link.
 */
export function RecentSubmissionsCard({
  recentSubmissions,
  canOpenSubmissions,
}: {
  recentSubmissions: SubmissionSummary[];
  canOpenSubmissions: boolean;
}) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-1">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">Recent submissions</h2>
            <p className="text-xs text-muted-foreground">The latest feedback from your portal.</p>
          </div>
          {canOpenSubmissions ? (
            <Link href="/dashboard/submissions" className="shrink-0 text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          ) : null}
        </div>
        {recentSubmissions.map((submission) => (
          <RecentSubmissionRow key={submission.id} submission={submission} canOpenSubmissions={canOpenSubmissions} />
        ))}
      </CardContent>
    </Card>
  );
}
