import { ArrowBigUp, CheckCircle2, CircleDot, ListChecks, MessageSquareDashed, SearchX } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { listCategories } from "@/features/categories/queries";
import { resolveCustomerIdentity } from "@/features/customers/customer-eligibility";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { getCustomerFeedbackStats, listSubmissions } from "@/features/submissions/queries";
import { listStatuses } from "@/features/statuses/queries";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

interface MyFeedbackPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Only this authenticated customer's own submissions, for this one
 * organization -- an additional `submittedBy` filter layered on top of
 * whatever submissions_select_scoped already permits the caller to see
 * (features/submissions/queries.ts's listSubmissions), never a separate or
 * looser authorization path. The shared portal board at /feedback/[slug]
 * intentionally still shows every customer's submissions (it's a public
 * roadmap people vote on) -- this page is the narrower, personal view on
 * top of that same data, not a replacement for it.
 *
 * Every filter (search/status/category/sort) is a real server-side query
 * parameter passed straight into listSubmissions -- a plain GET form, no
 * client-side fetch, and never the whole organization's submission table:
 * PostgREST does the filtering, this only ever receives the already-narrow
 * result set.
 */
export default async function MyFeedbackPage({ params, searchParams }: MyFeedbackPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) notFound();

  // A *customer* identity for this org, not just "someone is signed in" --
  // an internal owner/admin/member here resolves to null too (Phase 4),
  // sending them through the same sign-in redirect an anonymous visitor
  // gets. If they then try to sign back in targeting this exact page,
  // customerLogin's own eligibility check rejects that attempt with a
  // clear explanation instead of looping them back in.
  const user = await resolveCustomerIdentity(supabase, portal.organizationId);
  if (!user) {
    redirect(`/feedback/sign-in?next=/feedback/${slug}/my-feedback`);
  }

  const search = firstParam(query.q).trim();
  const statusParam = firstParam(query.status);
  const categoryParam = firstParam(query.category);
  const closedParam = firstParam(query.closed);
  const sortParam = firstParam(query.sort);
  const sort = sortParam === "oldest" || sortParam === "most_votes" ? sortParam : "newest";

  let statusId: string | undefined;
  let isClosed: boolean | undefined;
  if (statusParam) {
    statusId = statusParam;
  } else if (closedParam === "false") {
    isClosed = false;
  } else if (closedParam === "true") {
    isClosed = true;
  }

  const hasActiveFilters = Boolean(search || statusId || categoryParam || isClosed !== undefined || sortParam);

  const [categories, statuses, stats, submissions] = await Promise.all([
    listCategories(supabase, portal.organizationId, { activeOnly: true }),
    listStatuses(supabase, portal.organizationId),
    getCustomerFeedbackStats(supabase, portal.organizationId, user.id, []),
    listSubmissions(supabase, portal.organizationId, {
      submittedBy: user.id,
      search: search || undefined,
      statusId,
      categoryId: categoryParam || undefined,
      isClosed,
      sort,
    }),
  ]);

  const hasAnyFeedback = stats.total > 0;

  return (
    <div className="space-y-6">
      <div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-foreground">My Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you&apos;ve submitted to {portal.brandName ?? "this portal"}.
        </p>
      </div>

      {hasAnyFeedback ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="My Feedback"
            value={stats.total}
            icon={<ListChecks className="size-5" aria-hidden="true" />}
            accent="primary"
          />
          <StatCard
            label="Open"
            value={stats.open}
            icon={<CircleDot className="size-5" aria-hidden="true" />}
            accent="info"
          />
          <StatCard
            label="Resolved"
            value={stats.resolved}
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            accent="success"
          />
        </div>
      ) : null}

      {hasAnyFeedback ? (
        <form
          method="get"
          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <Input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search your feedback…"
            className="h-9 min-w-0 flex-1 sm:min-w-48"
            aria-label="Search your feedback"
          />
          <NativeSelect
            name="status"
            defaultValue={statusId ?? (isClosed === false ? "open" : isClosed === true ? "resolved" : "")}
            className="h-9 sm:w-auto"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </NativeSelect>
          {categories.length > 0 ? (
            <NativeSelect
              name="category"
              defaultValue={categoryParam}
              className="h-9 sm:w-auto"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          <NativeSelect name="sort" defaultValue={sort} className="h-9 sm:w-auto" aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="most_votes">Most votes</option>
          </NativeSelect>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            {hasActiveFilters ? (
              <Button asChild type="button" size="sm" variant="ghost">
                <Link href={`/feedback/${slug}/my-feedback`}>Reset filters</Link>
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!hasAnyFeedback ? (
        <EmptyState
          icon={<MessageSquareDashed className="size-5" aria-hidden="true" />}
          title="No feedback submitted yet"
          description="Share an idea or report an issue and it'll show up here so you can track its status."
          action={
            <Link href={`/feedback/${slug}`} className="text-sm font-medium text-primary hover:underline">
              Go to the portal
            </Link>
          }
        />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" aria-hidden="true" />}
          title="No feedback matches these filters"
          description="Try a different search term or clear your filters to see everything you've submitted."
          action={
            <Link href={`/feedback/${slug}/my-feedback`} className="text-sm font-medium text-primary hover:underline">
              Reset filters
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {submissions.map((submission) => (
            <Link
              key={submission.id}
              href={`/feedback/${slug}/${submission.id}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{submission.title}</p>
                <Badge variant={submission.type === "bug" ? "destructive" : "secondary"} className="shrink-0">
                  {submission.type}
                </Badge>
              </div>

              {submission.description ? (
                <p className="line-clamp-2 text-xs text-muted-foreground/90">{submission.description}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span
                  className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"
                  style={{ color: submission.statusColor }}
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: submission.statusColor }} />
                  {submission.statusName}
                </span>
                <span>{submission.categoryName ?? "Uncategorized"}</span>
                <span className="ml-auto flex items-center gap-1 tabular-nums">
                  <ArrowBigUp className="size-3.5" aria-hidden="true" />
                  {submission.voteCount}
                </span>
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground/80">
                <span>Submitted {formatDate(submission.createdAt)}</span>
                {submission.updatedAt !== submission.createdAt ? (
                  <span>Updated {formatDate(submission.updatedAt)}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
