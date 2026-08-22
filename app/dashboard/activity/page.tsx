import { Activity, Building2, Calendar, CalendarClock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  describeAuditActor,
  describeAuditEvent,
  listAuditEvents,
  resolveAuditActorNames,
  timelineAccentForAuditEvent,
} from "@/features/audit/queries";
import { getAuditEventTimestampsSince, getAuditStats } from "@/features/audit/stats";
import { getMemberActivityRanking } from "@/features/audit/member-activity";
import { buildLifecycleTimeline } from "@/features/audit/lifecycle";
import { enrichMembersWithContactInfo } from "@/features/members/queries";
import { getOrganizationCreatedAt } from "@/features/organizations/queries";

import { ActivityTimeline, type TimelineItem } from "@/components/analytics/activity-timeline";
import { ChartCard } from "@/components/analytics/chart-card";
import { LineChart } from "@/components/analytics/charts/line-chart";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { EmptyChartState } from "@/components/analytics/empty-chart-state";
import { StatCard } from "@/components/analytics/stat-card";
import { RoleBadge } from "@/components/domain/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { getTenantScope, type TenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasPage } from "@/lib/authorization/permissions";
import { getOrganizationMembers } from "@/lib/auth/organization-details";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { bucketTimestamps, granularityForRange, isChartRange, rangeToStartDate, type ChartRange } from "@/lib/analytics/time-ranges";

interface ActivityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function resolveActivityScope(): Promise<TenantScope | null> {
  try {
    return await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/activity");
    }
    if (error instanceof OrganizationNotFoundError || error instanceof OrganizationAccessDeniedError) {
      return null;
    }
    throw error;
  }
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The organization's analytics/activity center -- KPI cards, an
 * activity-over-time chart, a member activity ranking, the real audit
 * feed, and a merged organization lifecycle timeline. Every number here
 * comes from a real query (features/audit/stats.ts, member-activity.ts,
 * lifecycle.ts) -- see those files' own comments for exactly which
 * metrics audit_events can and can't reliably support, and why
 * submission/category/status volume is derived from those tables' own
 * created_at columns rather than the (much sparser) audit log.
 */
export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const params = await searchParams;
  const rawRange = first(params.range);
  const range: ChartRange = rawRange && isChartRange(rawRange) ? rawRange : "30d";

  const scope = await resolveActivityScope();

  if (!scope) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to see its activity log here."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { supabase, organization, user } = scope;

  // Route-level protection: audit_events_select_admin is also admin/owner
  // only at the RLS level -- a caller who somehow got past this check would
  // still just get an empty (RLS-filtered) result, never real data. This
  // check must happen before treating an empty result as "no activity yet"
  // instead of "you don't have access to this page."
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "activity")) {
    notFound();
  }

  const rangeStart = rangeToStartDate(range).toISOString();

  const [events, stats, rangeTimestamps, activityRanking, rawMembers, organizationCreatedAt] = await Promise.all([
    listAuditEvents(supabase, organization.id, { limit: 50 }),
    getAuditStats(supabase, organization.id),
    getAuditEventTimestampsSince(supabase, organization.id, rangeStart),
    getMemberActivityRanking(supabase, organization.id, rangeStart),
    getOrganizationMembers(supabase, organization.id, user.id),
    getOrganizationCreatedAt(supabase, organization.id),
  ]);

  const members = await enrichMembersWithContactInfo(supabase, organization.id, rawMembers);
  const roleByProfileId = new Map(members.map((member) => [member.profileId, member.role]));

  const actorNames = await resolveAuditActorNames(supabase, organization.id, events.map((event) => event.actorProfileId));

  const chartSeries = bucketTimestamps(rangeTimestamps, granularityForRange(range), rangeToStartDate(range));

  const lifecycle = buildLifecycleTimeline({
    organizationCreatedAt,
    organizationName: organization.name,
    members: members.map((member) => ({
      profileId: member.profileId,
      role: member.role,
      joinedAt: member.joinedAt,
      displayName: member.fullName || member.email || "A member",
      isCurrentUser: member.isCurrentUser,
    })),
    events,
    currentUserId: user.id,
    actorNames,
    limit: 12,
  });

  const feedItems: TimelineItem[] = events.slice(0, 15).map((event) => ({
    id: event.id,
    title: (
      <>
        <span className="font-medium">{describeAuditActor(event.actorProfileId, user.id, actorNames)}</span>{" "}
        {describeAuditEvent(event)}
      </>
    ),
    timestamp: event.createdAt,
    accent: timelineAccentForAuditEvent(event.action),
  }));

  const lifecycleItems: TimelineItem[] = lifecycle.map((entry) => ({
    id: entry.id,
    title: entry.title,
    timestamp: entry.timestamp,
    accent:
      entry.type === "organization_created"
        ? "primary"
        : entry.type === "member_joined"
          ? "success"
          : timelineAccentForAuditEvent(entry.action ?? ""),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Activity"
        description={`Real-time visibility into what's happening across ${organization.name}.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total events" value={stats.total} icon={<Activity className="size-5" aria-hidden="true" />} />
        <StatCard label="Today" value={stats.today} icon={<CalendarClock className="size-5" aria-hidden="true" />} accent="info" />
        <StatCard label="This week" value={stats.thisWeek} icon={<TrendingUp className="size-5" aria-hidden="true" />} accent="success" />
        <StatCard label="This month" value={stats.thisMonth} icon={<Calendar className="size-5" aria-hidden="true" />} accent="warning" />
      </div>

      <ChartCard
        title="Activity over time"
        description="Privileged actions recorded in your organization's audit log."
        filter={<DateRangeFilter basePath="/dashboard/activity" active={range} />}
        isEmpty={rangeTimestamps.length === 0}
        emptyState={
          <EmptyChartState
            title="No activity in this range"
            description="Try a wider date range, or check back after your team makes some admin changes."
          />
        }
      >
        <LineChart labels={chartSeries.map((point) => point.label)} series={{ label: "Events", data: chartSeries.map((point) => point.count) }} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
          <div className="mb-4 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Most active members</h2>
            <p className="text-xs text-muted-foreground">Submissions created + privileged actions taken in the selected range.</p>
          </div>
          {activityRanking.length === 0 ? (
            <EmptyChartState height={160} title="No member activity yet" description="Activity will appear here once your team starts working." />
          ) : (
            <div className="space-y-1">
              {activityRanking.map((entry) => {
                const role = roleByProfileId.get(entry.profileId);
                return (
                  <div key={entry.profileId} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
                    <Avatar className="size-8 shrink-0 after:hidden">
                      <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
                        {entry.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{entry.name}</span>
                        {role ? <RoleBadge role={role} /> : null}
                      </div>
                      {entry.email ? <p className="truncate text-xs text-muted-foreground">{entry.email}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {entry.totalCount} {entry.totalCount === 1 ? "action" : "actions"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
          <div className="mb-4 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Organization lifecycle</h2>
            <p className="text-xs text-muted-foreground">Creation, member joins, and privileged actions, most recent first.</p>
          </div>
          <ActivityTimeline items={lifecycleItems} />
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Activity log</h2>
          <p className="text-xs text-muted-foreground">Admin actions like status changes, role changes, and member management.</p>
        </div>
        {events.length === 0 ? (
          <EmptyState
            icon={<Activity className="size-5" aria-hidden="true" />}
            title="No activity yet"
            description="Admin actions like status changes will show up here."
          />
        ) : (
          <ActivityTimeline items={feedItems} />
        )}
      </div>
    </div>
  );
}
