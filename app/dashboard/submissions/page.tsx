import { Building2, CheckCircle2, CircleDot, Inbox } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listCategories } from "@/features/categories/queries";
import { listStatuses } from "@/features/statuses/queries";
import {
  getSubmissionStats,
  listSubmissions,
  type SubmissionFilters,
  type SubmissionType,
} from "@/features/submissions/queries";

import { StatCard, TrendIndicator } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { formatDate } from "@/lib/format";

interface SubmissionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The full submissions management surface, split out from the dashboard
 * overview (app/dashboard/page.tsx now only shows stats + a "Recent
 * submissions" summary card, see features/submissions/dashboard-stats.tsx).
 * Gated by its own `submissions` page permission -- deliberately NOT
 * `dashboard` -- see lib/authorization/registry.ts's PAGE_KEYS comment.
 * Filtering/search/sort logic and the list itself are unchanged from what
 * used to live on /dashboard -- moved, not rebuilt.
 */
export default async function SubmissionsPage({ searchParams }: SubmissionsPageProps) {
  const params = await searchParams;

  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/submissions");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Submissions" />
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

  const { supabase, organization } = scope;

  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "submissions")) {
    notFound();
  }

  const rawIsClosed = first(params.isClosed);
  const filters: SubmissionFilters = {
    statusId: first(params.statusId) || undefined,
    categoryId: first(params.categoryId) || undefined,
    type: (first(params.type) as SubmissionType | undefined) || undefined,
    search: first(params.search) || undefined,
    sort: first(params.sort) === "most_votes" ? "most_votes" : "newest",
    isClosed: rawIsClosed === "true" ? true : rawIsClosed === "false" ? false : undefined,
  };

  const [categories, statuses, submissions] = await Promise.all([
    listCategories(supabase, organization.id),
    listStatuses(supabase, organization.id),
    listSubmissions(supabase, organization.id, filters),
  ]);
  const stats = await getSubmissionStats(supabase, organization.id, statuses);

  const hasActiveFilters = Boolean(
    filters.statusId ||
      filters.categoryId ||
      filters.type ||
      filters.search ||
      filters.sort === "most_votes" ||
      filters.isClosed !== undefined,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Submissions"
        description={`Feature requests and bug reports for ${organization.name}.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total submissions" value={stats.total} icon={<Inbox className="size-5" aria-hidden="true" />} meta={`${stats.today} today`} />
        <StatCard
          label="Open"
          value={stats.open}
          icon={<CircleDot className="size-5" aria-hidden="true" />}
          accent="warning"
          href="/dashboard/submissions?isClosed=false"
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          accent="success"
          href="/dashboard/submissions?isClosed=true"
        />
        <StatCard
          label="New this week"
          value={stats.newThisWeek}
          icon={<Inbox className="size-5" aria-hidden="true" />}
          accent="info"
          trend={<TrendIndicator current={stats.newThisWeek} prior={stats.newPriorWeek} unit="vs. prior week" />}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl border border-border/70 bg-gradient-to-br from-card to-muted/30 p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)]">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor="search" className="text-xs text-muted-foreground">
            Search
          </label>
          <Input id="search" name="search" defaultValue={filters.search ?? ""} placeholder="Title contains…" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="statusId" className="text-xs text-muted-foreground">
            Status
          </label>
          <NativeSelect id="statusId" name="statusId" defaultValue={filters.statusId ?? ""}>
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="categoryId" className="text-xs text-muted-foreground">
            Category
          </label>
          <NativeSelect id="categoryId" name="categoryId" defaultValue={filters.categoryId ?? ""}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className="text-xs text-muted-foreground">
            Type
          </label>
          <NativeSelect id="type" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Feature &amp; bug</option>
            <option value="feature">Feature</option>
            <option value="bug">Bug</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <NativeSelect id="sort" name="sort" defaultValue={filters.sort}>
            <option value="newest">Newest</option>
            <option value="most_votes">Most votes</option>
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
        {hasActiveFilters ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard/submissions">Reset filters</Link>
          </Button>
        ) : null}
      </form>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {filters.search ? <Badge variant="outline">Search: {filters.search}</Badge> : null}
          {filters.statusId ? (
            <Badge variant="outline">Status: {statuses.find((s) => s.id === filters.statusId)?.name ?? filters.statusId}</Badge>
          ) : null}
          {filters.categoryId ? (
            <Badge variant="outline">Category: {categories.find((c) => c.id === filters.categoryId)?.name ?? filters.categoryId}</Badge>
          ) : null}
          {filters.type ? <Badge variant="outline">Type: {filters.type}</Badge> : null}
          {filters.isClosed !== undefined ? <Badge variant="outline">{filters.isClosed ? "Resolved" : "Open"}</Badge> : null}
          {filters.sort === "most_votes" ? <Badge variant="outline">Sort: Most votes</Badge> : null}
        </div>
      ) : null}

      {submissions.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden="true" />}
          title="No submissions yet"
          description="Feedback submitted through your public portal will show up here."
        />
      ) : (
        <div className="space-y-2">
          {submissions.map((submission) => (
            <Link
              key={submission.id}
              href={`/dashboard/submissions/${submission.id}`}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.3)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{submission.title}</span>
                  <Badge variant={submission.type === "bug" ? "destructive" : "secondary"}>
                    {submission.type}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {submission.categoryName ?? "Uncategorized"} · {formatDate(submission.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {submission.voteCount} {submission.voteCount === 1 ? "vote" : "votes"}
                </span>
                <span
                  className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={{
                    color: submission.statusColor,
                    borderColor: `${submission.statusColor}40`,
                    backgroundColor: `${submission.statusColor}14`,
                  }}
                >
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: submission.statusColor }} />
                  {submission.statusName}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
