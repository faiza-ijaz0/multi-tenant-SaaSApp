import { Building2, CircleDot, FolderKanban, Inbox, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listAuditEvents, resolveAuditActorNames } from "@/features/audit/queries";
import { RecentActivityCard } from "@/features/audit/recent-activity-card";
import { listCategories } from "@/features/categories/queries";
import { getCategoryStats } from "@/features/categories/stats";
import { getStatusStats } from "@/features/statuses/stats";
import {
  RecentSubmissionsCard,
  StatusBreakdownCard,
  SubmissionSecondaryStats,
} from "@/features/submissions/dashboard-stats";
import {
  getCategoryDistribution,
  getSubmissionStats,
  getSubmissionTimestampsSince,
  listRecentSubmissions,
} from "@/features/submissions/queries";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { listStatuses } from "@/features/statuses/queries";
import { computeMemberStats } from "@/lib/analytics/member-stats";
import {
  bucketTimestamps,
  granularityForRange,
  isChartRange,
  rangeToStartDate,
  type ChartRange,
} from "@/lib/analytics/time-ranges";

import { ChartCard } from "@/components/analytics/chart-card";
import { BarChart } from "@/components/analytics/charts/bar-chart";
import { LineChart } from "@/components/analytics/charts/line-chart";
import { DateRangeFilter } from "@/components/analytics/date-range-filter";
import { EmptyChartState } from "@/components/analytics/empty-chart-state";
import { QuickActionCard } from "@/components/analytics/quick-action-card";
import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { getOrganizationMembers } from "@/lib/auth/organization-details";

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The executive overview -- KPI row (Submissions/Categories/Statuses/
 * Members, each with real today/week/month deltas), a submission-trend
 * chart, status + category distribution, permission-gated Quick Actions,
 * and the existing "Recent submissions"/"Recent activity" summary cards.
 * The full filterable submissions list/management surface lives at
 * /dashboard/submissions (its own page, its own `submissions` page
 * permission -- see lib/authorization/registry.ts's PAGE_KEYS comment).
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const rawRange = first(params.range);
  const range: ChartRange = rawRange && isChartRange(rawRange) ? rawRange : "30d";

  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="You're not a member of an organization yet."
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

  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "dashboard")) {
    notFound();
  }
  const canViewActivity = hasPage(permissions, "activity");
  const canOpenSubmissions = hasPage(permissions, "submissions");
  const canOpenCategories = hasPage(permissions, "categories");
  const canOpenStatuses = hasPage(permissions, "statuses");
  const canOpenMembers = hasPage(permissions, "members");
  const canOpenOrgMembers = hasPage(permissions, "organization_members");
  const canCreateCategory = canOpenCategories && hasAction(permissions, "categories:create");
  const canCreateStatus = canOpenStatuses && hasAction(permissions, "statuses:create");

  const statuses = await listStatuses(supabase, organization.id);
  const categories = await listCategories(supabase, organization.id);
  const rangeStart = rangeToStartDate(range).toISOString();

  const [
    stats,
    categoryStats,
    statusStats,
    rawMembers,
    unreadNotifications,
    recentActivity,
    recentSubmissions,
    trendTimestamps,
    categoryDistribution,
  ] = await Promise.all([
    getSubmissionStats(supabase, organization.id, statuses),
    getCategoryStats(supabase, organization.id),
    getStatusStats(supabase, organization.id),
    getOrganizationMembers(supabase, organization.id, user.id),
    getUnreadNotificationCount(supabase, user.id, organization.id),
    canViewActivity ? listAuditEvents(supabase, organization.id, { limit: 5 }) : Promise.resolve([]),
    listRecentSubmissions(supabase, organization.id, 5),
    getSubmissionTimestampsSince(supabase, organization.id, rangeStart),
    getCategoryDistribution(supabase, organization.id, categories),
  ]);

  const memberStats = computeMemberStats(rawMembers);
  const actorNames = canViewActivity
    ? await resolveAuditActorNames(supabase, organization.id, recentActivity.map((event) => event.actorProfileId))
    : new Map<string, string>();

  const trendSeries = bucketTimestamps(trendTimestamps, granularityForRange(range), rangeToStartDate(range));
  const topCategories = [...categoryDistribution].sort((a, b) => b.count - a.count).filter((entry) => entry.count > 0).slice(0, 8);
  const hasStatusBreakdown = stats.byStatus.some((status) => status.count > 0);

  return (
    <div className="space-y-8">
      {/* TOP -- hero welcome panel. The two blurred corner glows are a
          whisper of depth (6-8% opacity) behind the header text, not a
          decoration competing with it -- see globals.css's --sky token
          comment for why this is a distinct hue from --info. */}
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-sky/12 blur-3xl"
        />
        <div className="relative px-5 py-6 sm:px-8 sm:py-8">
          <PageHeader
            eyebrow="Workspace"
            title="Dashboard"
            description={`Executive overview for ${organization.name}.`}
            className="border-b-0 pb-0"
          />
        </div>
      </section>

      {/* TOP -- primary KPI row. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total submissions"
          value={stats.total}
          icon={<Inbox className="size-5" aria-hidden="true" />}
          meta={`${stats.today} today · ${stats.newThisWeek} this week`}
          href={canOpenSubmissions ? "/dashboard/submissions" : undefined}
        />
        <StatCard
          label="Total categories"
          value={categoryStats.total}
          icon={<FolderKanban className="size-5" aria-hidden="true" />}
          accent="sky"
          meta={`${categoryStats.newThisWeek} this week · ${categoryStats.newThisMonth} this month`}
          href={canOpenCategories ? "/dashboard/categories" : undefined}
        />
        <StatCard
          label="Total statuses"
          value={statusStats.total}
          icon={<CircleDot className="size-5" aria-hidden="true" />}
          accent="warning"
          meta={`${statusStats.newThisWeek} this week · ${statusStats.newThisMonth} this month`}
          href={canOpenStatuses ? "/dashboard/statuses" : undefined}
        />
        <StatCard
          label="Total members"
          value={memberStats.total}
          icon={<Users className="size-5" aria-hidden="true" />}
          accent="success"
          meta={`${memberStats.newToday} today · ${memberStats.recentlyAdded} this week`}
          href={canOpenMembers ? "/dashboard/role-management" : undefined}
        />
      </div>

      <SubmissionSecondaryStats
        stats={stats}
        unreadNotifications={unreadNotifications}
        canOpenSubmissions={canOpenSubmissions}
      />

      {/* MAIN -- the dominant analytics surface. */}
      <ChartCard
        variant="hero"
        title="Submission trends"
        description="New submissions received over time, across your organization."
        filter={<DateRangeFilter basePath="/dashboard" active={range} />}
        isEmpty={trendTimestamps.length === 0}
        emptyState={
          <EmptyChartState
            height={280}
            title="No submission data yet"
            description="Feedback submitted through your public portal will show up here."
          />
        }
      >
        <LineChart
          labels={trendSeries.map((point) => point.label)}
          series={{ label: "Submissions", data: trendSeries.map((point) => point.count) }}
          height={280}
        />
      </ChartCard>

      {/* MAIN -- supporting status/category insights, side by side. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Category distribution"
          description="Which categories are receiving the most submissions."
          isEmpty={topCategories.length === 0}
          emptyState={
            <EmptyChartState
              height={180}
              title="No categorized submissions yet"
              description="Submissions assigned to a category will appear here."
            />
          }
        >
          <BarChart
            labels={topCategories.map((entry) => entry.name)}
            data={topCategories.map((entry) => entry.count)}
            seriesLabel="Submissions"
            horizontal
            height={Math.max(140, topCategories.length * 34)}
          />
        </ChartCard>

        {hasStatusBreakdown ? (
          <StatusBreakdownCard stats={stats} canOpenSubmissions={canOpenSubmissions} />
        ) : (
          <ChartCard
            title="Status breakdown"
            description="Where open work currently stands."
            isEmpty
            emptyState={
              <EmptyChartState
                height={180}
                title="No submissions yet"
                description="Status breakdown will appear once submissions come in."
              />
            }
          >
            <div />
          </ChartCard>
        )}
      </div>

      {/* BOTTOM -- recent submissions, recent activity, quick actions. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {recentSubmissions.length > 0 ? (
          <RecentSubmissionsCard recentSubmissions={recentSubmissions} canOpenSubmissions={canOpenSubmissions} />
        ) : null}
        {canViewActivity ? <RecentActivityCard events={recentActivity} currentUserId={user.id} actorNames={actorNames} /> : null}
      </div>

      <div>
        <div className="mb-3 space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground">Quick actions</h2>
          <p className="text-xs text-muted-foreground">Jump straight to the tools you use most.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {canOpenSubmissions ? (
            <QuickActionCard
              label="View submissions"
              description="Browse and manage feedback"
              href="/dashboard/submissions"
              icon={<Inbox className="size-4" aria-hidden="true" />}
              accent="primary"
            />
          ) : null}
          {canCreateCategory ? (
            <QuickActionCard
              label="Add category"
              description="Organize submissions by topic"
              href="/dashboard/categories"
              icon={<FolderKanban className="size-4" aria-hidden="true" />}
              accent="sky"
            />
          ) : null}
          {canCreateStatus ? (
            <QuickActionCard
              label="Add status"
              description="Define a new workflow state"
              href="/dashboard/statuses"
              icon={<CircleDot className="size-4" aria-hidden="true" />}
              accent="warning"
            />
          ) : null}
          {canOpenMembers ? (
            <QuickActionCard
              label="Manage roles"
              description="Members, roles, and permissions"
              href="/dashboard/role-management"
              icon={<UserCog className="size-4" aria-hidden="true" />}
              accent="info"
            />
          ) : null}
          {canOpenOrgMembers ? (
            <QuickActionCard
              label="Organization members"
              description="See who has access"
              href="/dashboard/settings/organization/members"
              icon={<Users className="size-4" aria-hidden="true" />}
              accent="success"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
