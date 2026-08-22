import { CheckCircle2, CircleDot, ListChecks, MessageSquareHeart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatCard } from "@/components/analytics/stat-card";
import { SubmitFeedbackDialog } from "@/components/customer-portal/submit-feedback-dialog";
import { listCategories } from "@/features/categories/queries";
import { resolveCustomerIdentity } from "@/features/customers/customer-eligibility";
import { getPortalBySlug, sanitizePortalAccentColor } from "@/features/portal-settings/queries";
import { getCustomerFeedbackStats, listSubmissions } from "@/features/submissions/queries";
import { listStatuses } from "@/features/statuses/queries";
import { getVotedSubmissionIds } from "@/features/votes/queries";
import { VoteButton } from "@/features/votes/vote-button";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { createClient } from "@/lib/supabase/server";

interface FeedbackPortalPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FeedbackPortalPage({ params, searchParams }: FeedbackPortalPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const sortParam = Array.isArray(query.sort) ? query.sort[0] : query.sort;
  const sort = sortParam === "most_votes" ? "most_votes" : "newest";
  const supabase = await createClient();

  // getPortalBySlug is subject to portal_settings_select_member_or_public:
  // an anonymous or unrelated visitor to a private portal simply gets
  // nothing back here -- notFound() below is the correct, anti-enumeration
  // response for "doesn't exist" and "exists but private" alike.
  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) notFound();
  const accentColor = sanitizePortalAccentColor(portal.accentColor);

  // A *customer* identity, not just "someone is signed in" -- an internal
  // owner/admin/member of this exact org with no real customer relationship
  // here resolves to null here too, same as an anonymous visitor (Phase 4;
  // see resolveCustomerIdentity's own comment).
  const user = await resolveCustomerIdentity(supabase, portal.organizationId);

  const [categories, submissions, statuses, stats] = await Promise.all([
    listCategories(supabase, portal.organizationId, { activeOnly: true }),
    listSubmissions(supabase, portal.organizationId, { sort }),
    listStatuses(supabase, portal.organizationId),
    user
      ? getCustomerFeedbackStats(supabase, portal.organizationId, user.id, [])
      : Promise.resolve(null),
  ]);

  const votedIds = user
    ? await getVotedSubmissionIds(
        supabase,
        user.id,
        submissions.map((submission) => submission.id),
      )
    : new Set<string>();

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 px-6 py-14 shadow-[0_16px_48px_-20px_hsl(var(--shadow-color)/0.3)] ring-1 ring-foreground/5 sm:px-10 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 size-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 size-72 rounded-full bg-sky/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
            <MessageSquareHeart className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            {accentColor ? (
              <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
            ) : null}
            {portal.brandName ?? "Feedback portal"}
          </p>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Your feedback drives better products.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            {portal.welcomeMessage ??
              "Share ideas, report issues, and help the team prioritize what matters most."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {user ? (
              <>
                <SubmitFeedbackDialog slug={slug} categories={categories} triggerSize="lg" />
                <Button asChild size="lg" variant="outline">
                  <Link href={`/feedback/${slug}/my-feedback`}>View My Feedback</Link>
                </Button>
              </>
            ) : (
              <Button asChild size="lg">
                <Link href={`/feedback/sign-in?next=/feedback/${slug}`}>Sign in to share feedback</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {stats ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="My Feedback"
            value={stats.total}
            icon={<ListChecks className="size-5" aria-hidden="true" />}
            href={`/feedback/${slug}/my-feedback`}
            accent="primary"
          />
          <StatCard
            label="Open"
            value={stats.open}
            icon={<CircleDot className="size-5" aria-hidden="true" />}
            href={`/feedback/${slug}/my-feedback?closed=false`}
            accent="info"
          />
          <StatCard
            label="Resolved"
            value={stats.resolved}
            icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
            href={`/feedback/${slug}/my-feedback?closed=true`}
            accent="success"
          />
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Community feedback</h2>
          {submissions.length > 1 ? (
            <form method="get" className="flex items-center gap-1.5">
              <label htmlFor="portal-sort" className="text-xs text-muted-foreground">
                Sort
              </label>
              <NativeSelect id="portal-sort" name="sort" defaultValue={sort} className="h-8 w-auto">
                <option value="newest">Newest</option>
                <option value="most_votes">Most votes</option>
              </NativeSelect>
              <Button type="submit" size="sm" variant="outline">
                Apply
              </Button>
            </form>
          ) : null}
        </div>
        {submissions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-3 py-10 text-center text-sm text-muted-foreground">
            No feedback yet -- be the first to share an idea.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {submissions.map((submission) => {
              const status = statuses.find((s) => s.id === submission.statusId);
              return (
                <div
                  key={submission.id}
                  className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_16px_36px_-16px_hsl(var(--shadow-color)/0.3)]"
                >
                  {/* Stretched-link pattern: covers the whole card so the
                   * entire surface is clickable, but sits *below* the
                   * VoteButton in stacking order (that button gets its own
                   * z-10 below) so voting never also triggers navigation --
                   * VoteButton can't be nested inside this anchor at all
                   * (a <button> inside <a> is invalid HTML). */}
                  <Link
                    href={`/feedback/${slug}/${submission.id}`}
                    className="absolute inset-0 z-0"
                    aria-label={submission.title}
                  />
                  <div className="pointer-events-none flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {submission.title}
                    </p>
                    <Badge variant={submission.type === "bug" ? "destructive" : "secondary"} className="shrink-0">
                      {submission.type}
                    </Badge>
                  </div>
                  <div className="pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                    <span
                      className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5"
                      style={{ color: submission.statusColor }}
                    >
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: submission.statusColor }} />
                      {status?.name ?? submission.statusName}
                    </span>
                    <span>{submission.categoryName ?? "Uncategorized"}</span>
                  </div>
                  <div className="relative z-10 mt-auto flex items-center justify-between border-t border-border/60 pt-3">
                    <VoteButton
                      submissionId={submission.id}
                      voteCount={submission.voteCount}
                      hasVoted={votedIds.has(submission.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
